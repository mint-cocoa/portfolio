# Ansible And Kubespray

Kubespray is intentionally not committed as source code. The committed
`kubespray.lock` pins the upstream repository and release tag, while
`bootstrap-kubespray.sh` recreates the local checkout under `ansible/vendor/`.

```bash
cd ansible
./bootstrap-kubespray.sh
source .venv/bin/activate
cd vendor/kubespray
ansible-playbook -i ../../inventory/home/hosts.yaml cluster.yml
```

Current pin:

- Repository: `https://github.com/kubernetes-sigs/kubespray.git`
- Ref: `v2.30.0`
- Release commit short SHA: `f4ccdb5`

The pin is deliberately separated from the generated checkout so review diffs
show intent instead of thousands of vendored files.

## Operational Playbooks

`playbooks/apply-nfs-pv-backup.yml` applies the Kubernetes CronJob manifest that
backs up the NFS-backed PV root with restic. The restic credentials should be
managed through encrypted GitOps secrets, not Ansible vars.
