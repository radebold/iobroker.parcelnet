# Public beta checklist for ioBroker latest

This repository is prepared for submission to the official ioBroker **latest** repository.

## Manual steps still required

1. Rename the GitHub repository to `ioBroker.parcelnet`
2. Add GitHub topics to the repository
3. Publish the package to npm as `iobroker.parcelnet`
4. Add npm owner:
   ```bash
   npm owner add bluefox iobroker.parcelnet
   ```
5. Run the official adapter checker:
   - https://adapter-check.iobroker.in/
6. Create or use the GitHub issue tracker for feedback
7. Submit the adapter to **latest**
   - via `iobroker.dev` → Manage → `ADD TO LATEST`
   - or via PR to `ioBroker/ioBroker.repositories`

## Notes for stable later

For **stable**, the adapter must first be in **latest** and should have:
- a forum test thread
- real user feedback
- a tested stable version
