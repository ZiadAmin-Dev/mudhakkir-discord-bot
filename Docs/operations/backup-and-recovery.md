# Backup and recovery

Mudhakkir stores all durable state in one SQLite database. The default path is `data/mudhakkir.db`, but it can be overridden with the `DB_PATH` environment variable (a full file path). On hosts that replace the app directory on redeploy, set `DB_PATH` to a file on persistent storage, e.g. `/data/mudhakkir/mudhakkir.db`. Slash commands, schedules, and the delivery ledger are rebuildable or derived; the database and `.env` are the files that matter.

## What to back up

| File | Required | Why |
| --- | --- | --- |
| `data/mudhakkir.db` | Yes | Settings and delivery ledger. |
| `data/mudhakkir.db-wal`, `data/mudhakkir.db-shm` | Yes, if copying while running | WAL mode keeps recent commits here until checkpoint. |
| `.env` | Yes, stored separately and securely | Bot token and `CLIENT_ID`; never commit it. |
| `assets/audio/` | Optional | Placeholder assets are reproducible; real recitations are not. |

All commands below assume the default path. If `DB_PATH` is set, substitute that full file path (and its `-wal`/`-shm` siblings).

## Safe backup while the bot is running

Use SQLite's online backup API so the WAL is included:

```bash
sqlite3 data/mudhakkir.db ".backup '/backup/mudhakkir-$(date +%F).db'"
```

Do not copy only `mudhakkir.db` while the bot is running — you may lose the latest commits held in the WAL file.

## Safe backup after stopping the bot

```bash
sudo systemctl stop mudhakkir
cp data/mudhakkir.db* /backup/
sudo systemctl start mudhakkir
```

Graceful shutdown checkpoints and closes the database, so copying all three files is consistent.

## Docker

The compose file uses a named volume mounted at `/app/data`. Back it up with a throwaway container:

```bash
docker compose run --rm --entrypoint sh mudhakkir -c \
  "sqlite3 /app/data/mudhakkir.db '.backup /app/data/backup.db'"
docker cp mudhakkir:/app/data/backup.db ./mudhakkir-backup.db
```

## Restore

1. Stop the bot.
2. Replace `data/mudhakkir.db` (and `-wal`/`-shm` if you backed them up) with the backup.
3. Confirm `.env` still has the correct `DISCORD_TOKEN` and `CLIENT_ID`.
4. Start the bot; on `ClientReady` it rebuilds schedules from the saved settings.
5. Run `/settings` and `/prayer-times` in Discord to confirm configuration and calculation.

Already-delivered events stay deduplicated because the ledger is inside the database. Events whose trigger passed while the bot was offline are not replayed (BR-045).

## Suggested schedule

A daily backup retained for 7 days is sufficient for this MVP:

```cron
0 3 * * * sqlite3 /opt/mudhakkir/data/mudhakkir.db ".backup /backup/mudhakkir-$(date +\%F).db"
```

Keep backups outside the application directory so a redeploy does not overwrite them.
