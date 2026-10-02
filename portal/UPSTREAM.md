Portal sources: discord-tickets/portal, commit 07626745d6d29c8438136561082a91cb6ae40be8 (2.5.5).
The build is committed so bot hosts do not need frontend build tools.
Rebuild: npm --prefix portal ci --ignore-scripts && npm --prefix portal run build
