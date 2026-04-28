# Homelab Ops Hardening Roadmap

Last updated: 2026-04-28

This checklist tracks the remaining infrastructure hardening work separately
from the public portfolio narrative.

| Area | Current improvement | Remaining work |
|---|---|---|
| Terraform state | Added S3 backend contract with encryption and lockfile support | Create the real bucket, enable versioning, and run `terraform init -backend-config=backend.home.hcl` |
| Kubespray source | Added `ansible/kubespray.lock` and reproducible bootstrap script pinned to `v2.30.0` | Run bootstrap, review release notes against the live Kubernetes version, and keep future upgrades as lock diffs |
| GitOps secrets | Added SOPS/age convention and restic secret template | Add real age recipient, encrypt actual secrets, and wire Argo CD decryption |
| NFS/PV backup | Added restic CronJob manifest for the NFS PV root | Apply after encrypted `storage-backup/nfs-pv-backup-restic` secret exists, then test restore |

## Verification Commands

```bash
git status --short
terraform -chdir=terraform init -backend-config=backend.home.hcl
ansible/bootstrap-kubespray.sh
kubectl apply -f deploy/nfs-pv-backup-cronjob.yaml
kubectl -n storage-backup create job --from=cronjob/nfs-pv-restic-backup nfs-pv-restic-backup-smoke
kubectl -n storage-backup logs job/nfs-pv-restic-backup-smoke
```

Do not run the Terraform or Kubernetes commands until backend credentials and
the encrypted restic secret are prepared.
