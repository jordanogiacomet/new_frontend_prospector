import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function exactLocation(nginxServer: string, path: string): string {
  const start = nginxServer.indexOf(`location = ${path} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const end = nginxServer.indexOf("\n    }", start);
  expect(end).toBeGreaterThan(start);
  return nginxServer.slice(start, end);
}

describe("Demo 3 contact enrichment v2 TLS edge packaging", () => {
  it("packages one isolated TLS NodePort without versioning key material", () => {
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");
    const operator = readRepositoryFile(
      "scripts/prepare-demo3-contact-v2-tls.mjs",
    );

    expect(manifest).toMatch(
      /name: contact-edge\s+containerPort: 8443/,
    );
    expect(manifest).toMatch(
      /name: contact-https\s+port: 443\s+targetPort: contact-edge\s+nodePort: 30443/,
    );
    expect(manifest).toMatch(
      /name: contact-v2-tls\s+secret:\s+secretName: prospecta-contact-v2-tls/,
    );
    expect(operator).toContain('const contactNodePort = 30443;');
    expect(operator).toContain('const contactHost = "192.168.0.20";');
    expect(operator).toContain(
      'n8nNamespaceUid: required("DEMO3_EXPECTED_N8N_NAMESPACE_UID")',
    );
    expect(operator).toContain("assertNoActiveN8nExecutions();");
    expect(operator).toContain("subjectAltName=IP:${contactHost}");
    expect(operator).toContain(
      'const n8nCaPath = "/home/node/contact-v2-ca.crt";',
    );
    expect(operator).not.toContain("/opt/custom-certificates");
    expect(operator).toContain(
      '{ name: "EXECUTIONS_DATA_HARD_DELETE_BUFFER", value: "0" }',
    );
    expect(operator).toContain(
      '{ name: "EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL", value: "1" }',
    );
    expect(operator).not.toMatch(
      /BEGIN (?:CERTIFICATE|PRIVATE KEY)|replace-prospecta\.example\.com/,
    );
  });

  it("keeps legacy NodePorts while packaging the private TLS listener and CA", () => {
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");
    const edgeDockerfile = readRepositoryFile("k8s/Dockerfile.demo3-edge");

    expect(manifest).toContain("nodePort: 30100");
    expect(manifest).toContain(
      "N8N_CONTACT_ENRICHMENT_URL: http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers",
    );
    expect(manifest).toMatch(
      /name: edge\s+containerPort: 8080[\s\S]*name: contact-edge\s+containerPort: 8443/,
    );
    expect(manifest).toContain("name: NODE_EXTRA_CA_CERTS");
    expect(manifest).toContain(
      "value: /etc/prospecta/contact-v2-ca/ca.crt",
    );
    expect(manifest).toMatch(
      /name: contact-v2-ca\s+configMap:\s+name: prospecta-contact-v2-ca[\s\S]*key: ca\.crt/,
    );
    expect(manifest).toMatch(
      /cidr: 192\.168\.0\.20\/32[\s\S]*port: 30098[\s\S]*port: 30443/,
    );
    expect(manifest).toMatch(
      /kubernetes\.io\/metadata\.name: n8n[\s\S]*app: n8n[\s\S]*port: 5678/,
    );
    expect(edgeDockerfile).toContain(
      "COPY k8s/demo3-nginx.conf /etc/nginx/nginx.conf",
    );
  });

  it("terminates TLS on 8443 and exposes only exact v2 machine paths", () => {
    const nginx = readRepositoryFile("k8s/demo3-nginx.conf");
    const serverMarker = /^  server \{$/gm;
    const serverStarts = [...nginx.matchAll(serverMarker)].map(
      (match) => match.index,
    );

    expect(serverStarts).toHaveLength(2);
    const httpServer = nginx.slice(serverStarts[0], serverStarts[1]);
    const httpsServer = nginx.slice(serverStarts[1]);

    expect(httpServer).toContain("listen 8080");
    expect(httpServer).toContain("X-Forwarded-Proto http;");
    expect(httpServer).not.toContain("X-Forwarded-Proto https;");
    expect(httpServer).toContain("location = /api/imports/events");
    expect(httpServer).toContain(
      "location = /api/contact-enrichment/callback",
    );
    expect(httpServer).not.toContain("/api/contact-enrichment/v2/");

    expect(httpsServer).toContain("listen 8443 ssl");
    expect(httpsServer).toContain(
      "ssl_certificate /etc/nginx/contact-v2-tls/tls.crt",
    );
    expect(httpsServer).toContain(
      "ssl_certificate_key /etc/nginx/contact-v2-tls/tls.key",
    );
    expect(httpsServer).toContain("X-Forwarded-Proto https;");
    expect(httpsServer).not.toContain("X-Forwarded-Proto http;");

    const n8nWebhook = exactLocation(
      httpsServer,
      "/webhook/prospecta/lusha/contact-enrichment-v2",
    );
    expect(n8nWebhook).not.toContain("auth_basic");
    expect(n8nWebhook).toContain(
      "proxy_pass http://n8n.n8n.svc.cluster.local:5678",
    );
    expect(httpsServer.match(/proxy_pass http:\/\/n8n\.n8n\.svc\.cluster\.local:5678/g)).toHaveLength(1);

    for (const path of [
      "/api/contact-enrichment/v2/callback",
      "/api/contact-enrichment/v2/company-search-callback",
      "/api/contact-enrichment/v2/reveal-callback",
    ]) {
      const callback = exactLocation(httpsServer, path);
      expect(callback).not.toContain("auth_basic");
      expect(callback).toContain("X-Forwarded-Proto https;");
      expect(callback).toContain(
        "X-Prospecta-Contact-Callback-Secret $http_x_prospecta_contact_callback_secret",
      );
      expect(nginx.match(new RegExp(path.replaceAll("/", "\\/"), "g"))).toHaveLength(
        1,
      );
    }

    const browserLocation = httpsServer.match(
      /location \/ \{([\s\S]*?)\n    \}/,
    )?.[1];
    expect(browserLocation).toBeDefined();
    expect(browserLocation).toContain('auth_basic "Prospecta Demo 3"');
    expect(browserLocation).toContain("X-Forwarded-Proto https;");
  });
});
