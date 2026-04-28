# Encrypted GitOps Secrets

Application and operations secrets should be committed only after SOPS
encryption. Cleartext templates are allowed as examples, but real `*.plain.yaml`
and decrypted `*.dec.yaml` files are ignored.

One-time setup:

```bash
cd gitops/secrets
cp .sops.yaml.example .sops.yaml
age-keygen -o age.key
age-keygen -y age.key
```

Put the public recipient in `.sops.yaml`, then encrypt real secret manifests:

```bash
cp nfs-pv-backup-restic.secret.template.yaml nfs-pv-backup-restic.secret.plain.yaml
sops --encrypt nfs-pv-backup-restic.secret.plain.yaml > nfs-pv-backup-restic.secret.enc.yaml
```

Apply through GitOps with a controller such as Argo CD plus a SOPS integration
plugin, or decrypt only inside a trusted CI/CD runner:

```bash
sops --decrypt nfs-pv-backup-restic.secret.enc.yaml | kubectl apply -f -
```

Secrets currently expected by manifests:

- `storage-backup/nfs-pv-backup-restic`
  - `RESTIC_REPOSITORY`
  - `RESTIC_PASSWORD`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
