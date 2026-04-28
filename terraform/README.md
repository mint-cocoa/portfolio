# Terraform State Backend

This directory keeps the Terraform backend contract for homelab infrastructure.
Local state must not be committed. Initialize Terraform with a partial S3 backend
configuration so state is remote, encrypted, and locked.

```bash
cd terraform
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
terraform init -backend-config=backend.home.hcl
```

`backend.home.hcl.example` is intentionally commit-safe. Copy it to
`backend.home.hcl`, point it at the real state bucket, and keep credentials in
environment variables or the local AWS credentials file.

Backend requirements:

- S3-compatible bucket with versioning enabled.
- Server-side encryption enabled by `encrypt = true`.
- S3 native state locking enabled by `use_lockfile = true`.
- No local `*.tfstate`, `*.tfvars`, or `.terraform/` files in git.

For AWS S3, remove the S3-compatible `endpoints` and skip flags from the local
backend config. For MinIO/Garage-style endpoints, keep path-style access enabled.
