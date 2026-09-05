# Security and data handling

This repository is a synthetic prototype. Do not enter real customer data, expose the local API on a public network, or treat its Agent/Manager switch as authentication.

The public and offline demos run in memory and reset on reload. The local version persists synthetic state in a SQLite file under `work/`; database files, local environment files, and generated test output are excluded from version control. The app does not include analytics or a remote call-data API.

If you report a problem in a public issue, use synthetic reproduction steps and omit sensitive details. The project currently has no dedicated private disclosure channel and makes no production security or support commitment. Access control, real identity, deployment hardening, retention, and operational review are prerequisites for any real-data pilot.
