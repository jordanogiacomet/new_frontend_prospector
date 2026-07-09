# Read-only Lead Browser

Read-only business interface for lead qualification data.

## Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
pnpm lint
pnpm build
```

## Local Kubernetes Demo

This is a synthetic, non-production presentation profile. It does not run
migrations, use real credentials, or call the productive n8n workflow.

```bash
docker build -t localhost:5000/prospecta/app:demo .
docker push localhost:5000/prospecta/app:demo
kubectl apply -f k8s/prospecta-demo.yaml
kubectl -n prospecta-demo rollout status deploy/prospecta-demo
```

Open [http://192.168.0.20:30097/leads](http://192.168.0.20:30097/leads).
Replace placeholders in `k8s/prospecta-demo.yaml` before using any real
non-production integration.
