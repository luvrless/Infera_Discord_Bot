import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DISCORD_TOKEN ??= "test-discord-token-00000000000000000000000000000000";
process.env.DISCORD_CLIENT_ID ??= "123456789012345678";
process.env.DISCORD_CLIENT_SECRET ??= "test-client-secret-00000000";
process.env.DATABASE_URL ??= "file:./test.db";
process.env.SESSION_SECRET ??= "0".repeat(64);
process.env.JWT_SECRET ??= "1".repeat(64);
process.env.ENCRYPTION_KEY ??= "a".repeat(64);
process.env.WEBHOOK_SIGNING_SECRET ??= "3".repeat(64);

describe("Command Registry", () => {
  it("registers all canonical commands with unique names and non-colliding aliases", async () => {
    const { COMMANDS, registry } = await import("../index");
    assert.ok(COMMANDS.length >= 180, `Expected at least 180 commands, found ${COMMANDS.length}`);
    assert.equal(registry.count(), COMMANDS.length);

    const names = new Set<string>();
    const aliases = new Set<string>();
    for (const cmd of COMMANDS) {
      assert.ok(cmd.name && cmd.name === cmd.name.toLowerCase(), `Invalid command name: ${cmd.name}`);
      assert.ok(!names.has(cmd.name), `Duplicate command name: ${cmd.name}`);
      names.add(cmd.name);
      assert.ok(cmd.description.length >= 5, `Command ${cmd.name} needs a description`);
      assert.equal(typeof cmd.execute, "function", `Command ${cmd.name} missing execute()`);
      for (const alias of cmd.aliases ?? []) {
        const lower = alias.toLowerCase();
        assert.ok(!names.has(lower), `Alias ${alias} collides with command name`);
        assert.ok(!aliases.has(lower), `Duplicate alias ${alias}`);
        aliases.add(lower);
      }
    }
  });
});

describe("Configuration & Event Registry", () => {
  it("defines valid schemas and defaults for every configuration key", async () => {
    const { CONFIG_KEYS, CONFIG_REGISTRY } = await import("@infera/shared");
    assert.ok(CONFIG_KEYS.length > 30);
    for (const key of CONFIG_KEYS) {
      const entry = CONFIG_REGISTRY.get(key);
      assert.ok(entry, `Missing registry entry for ${key}`);
      assert.equal(entry.key, key);
      assert.ok(entry.description.length > 0, `Missing description for ${key}`);
    }
  });

  it("validates realtime event names", async () => {
    const { isValidEventName } = await import("@infera/shared");
    assert.equal(isValidEventName("moderation.case.created"), true);
    assert.equal(isValidEventName("config.updated"), true);
    assert.equal(isValidEventName("not.a.real.event"), false);
  });
});
