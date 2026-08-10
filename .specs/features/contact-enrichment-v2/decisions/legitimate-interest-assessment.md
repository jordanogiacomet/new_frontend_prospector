# Legitimate-interest assessment — contact-enrichment-v2

Status: approved for the controlled Demo 3 test described by this assessment.

## Controller facts — required before real processing

- Legal controller name: **APOLLO GESTÃO EMPREENDEDORA LTDA**
- Controller registration/CNPJ: **23.330.758/0001-93**
- Public privacy/DPO contact: **jordano.tomazoni@apollogestao.com.br**
- Accountable approver and Demo 3 operator: **repository owner/operator who
  supplied the controller facts**, confirmed on 2026-08-06. No individual
  legal name is inferred from the supplied e-mail address.
- Approval date: **2026-08-06**.
- Next review: **2027-08-06**, or earlier after a purpose, provider, field,
  retention, controller, security, or target change.

## 1. Purpose test

The specific purpose is a relevant, human-reviewed, one-to-one B2B approach to
an accounting, finance, ownership, or executive decision maker at a company
already present in the commercial queue. It does not authorize list building,
bulk export, automated decisions, automated outreach, unrelated advertising,
or private-life profiling.

Expected controller benefit: locate a suitable professional channel for a
qualified commercial conversation. Expected contact/company benefit: receive a
potentially relevant business proposal and a transparent, simple opt-out.

The purpose must be stated on first contact. Lusha is identified as the source.

## 2. Necessity test

- Search starts with an organization domain or an explicitly submitted company
  name, never a person. A company-name result requires human confirmation and
  its provider lookup may consume a search credit.
- At most 10 previews are retained and only one human-selected preview is
  revealed per action.
- Only current professional context, work email and work/direct non-DNC phone
  are processed.
- Private/unknown email, mobile/unknown phone, DNC phone and all nonessential
  provider fields are discarded.
- Preview expires in 30 days and revealed channels in 90 days.
- No less intrusive internal source currently supplies the approved channels.

If an existing approved channel is already present or the contact is
suppressed, reveal is not necessary and must not run.

## 3. Balance and safeguards

Reasonable expectation is not assumed merely because a profile is public or
available from a provider. Before each reveal, the user confirms a relevant
professional role and specific company context. The first approach discloses
controller, source, purpose and opt-out. The contact can oppose processing and
request access/correction/deletion at no cost.

Risks include unexpected outreach, exposure of personal channels, obsolete
data, repeated contact, provider DNC mismatch, interception, unauthorized
internal access and excessive retention. Safeguards are strict field/channel
allowlists, human selection, independent permissions, encryption, HTTPS,
suppression before every phase, no automatic retry, short retention, erasure,
no raw payload/logging, and individual production identity.

The assessment is automatically adverse when any of these is true:

- controller identity or privacy channel is missing;
- purpose cannot be tied to a qualified company and professional role;
- data is sensitive, private, unknown-type, DNC, suppressed, expired or about a
  minor;
- HTTPS, encryption, source contract, suppression or individual production
  authorization is unavailable;
- the contact's rights or objection outweigh the stated business need.

## Decision

Repository implementation and synthetic verification: **APPROVED**.

Real Demo 3 processing: **APPROVED only for the controlled single-company,
single-selected-contact test after HTTPS, no-execution-data and named test-case
preflights pass**.

Production: **PENDING target-specific technical and accountable sign-off**.

Approved by the accountable controller/operator: **repository owner/operator
who supplied the controller facts**

Approval date: **2026-08-06**

Next review: **2027-08-06**
