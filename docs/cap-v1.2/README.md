# docs/cap-v1.2/ — vendored OASIS CAP 1.2 references

Reference copies of the **Common Alerting Protocol Version 1.2** (OASIS Standard, 01 July 2010,
OASIS Emergency Management TC), downloaded 2026-10-13 from the OASIS servers:

| File | Source |
|---|---|
| [`CAP-v1.2-os.html`](./CAP-v1.2-os.html) | https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html |
| [`CAP-v1.2.xsd`](./CAP-v1.2.xsd) | https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.xsd |

**These are verbatim vendor copies** — do not edit them. The runtime backing model used by the
backend is `backend/common/src/main/resources/cap-v1.2.xsd`, which is byte-identical to the XSD here
(`cmp` is clean) and is compile-checked by `java scripts/xsd-check.java`. If the schema needs to
change, replace both and re-run that check.

Key facts when reading the spec:

- Declared namespace: `urn:oasis:names:tc:emergency:cap:1.2`.
- An `<alert>` carries `identifier`, `sender`, `sent` (a `xs:dateTime` that **must** carry a timezone
  offset), `status`, `msgType`, `scope`, and zero or more `info` blocks; the `status`, `msgType`,
  `scope`, `category`, `responseType`, `urgency`, `severity` and `certainty` vocabularies are
  **closed** enumerations.
- The `<info>` block is what routing rules read: `urgency` (time to prepare), `severity` (intensity),
  `certainty` (confidence), plus `event`, `responseType`, `effective`/`onset`/`expires`, and `area`.
- Appendix A has worked message examples (Homeland Security Advisory, Severe Thunderstorm Warning,
  Earthquake Update, AMBER Alert multilingual).
