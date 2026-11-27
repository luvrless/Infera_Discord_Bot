import { SlashCommandBuilder } from "discord.js";
import { InferaError, PermissionLevel } from "@infera/shared";
import type { CommandCategory, CommandDefinition, SlashOption } from "./types";

export interface CommandManifestEntry {
  name: string;
  description: string;
  category: CommandCategory;
  aliases: string[];
  usage: string | null;
  examples: string[];
  level: PermissionLevel;
  cooldownMs: number;
  guildOnly: boolean;
  ownerOnly: boolean;
  slash: boolean;
  module: string | null;
}

function addOption(builder: SlashCommandBuilder, option: SlashOption): void {
  switch (option.type) {
    case "string": {
      const adder = builder.addStringOption((opt) => {
        const base = opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
        return option.choices
          ? base.addChoices(...(option.choices as Array<{ name: string; value: string }>))
          : base.setMaxLength(2000);
      });
      void adder;
      break;
    }
    case "integer": {
      builder.addIntegerOption((opt) => {
        let base = opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
        if (option.min !== undefined) base = base.setMinValue(option.min);
        if (option.max !== undefined) base = base.setMaxValue(option.max);
        return base;
      });
      break;
    }
    case "number":
      builder.addNumberOption((opt) =>
        opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false),
      );
      break;
    case "boolean":
      builder.addBooleanOption((opt) =>
        opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false),
      );
      break;
    case "user":
      builder.addUserOption((opt) =>
        opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false),
      );
      break;
    case "member":
      builder.addUserOption((opt) =>
        opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false),
      );
      break;
    case "channel":
      builder.addChannelOption((opt) =>
        opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false),
      );
      break;
    case "role":
      builder.addRoleOption((opt) =>
        opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false),
      );
      break;
    default:
      break;
  }
}

export function buildSlashData(command: CommandDefinition): ReturnType<SlashCommandBuilder["toJSON"]> {
  const builder = new SlashCommandBuilder()
    .setName(command.name)
    .setDescription(command.description.slice(0, 100))
    .setDMPermission(command.guildOnly === false);

  for (const option of command.slashOptions ?? []) addOption(builder, option);

  if (command.userPermissions && command.userPermissions.length > 0) {
    const combined = command.userPermissions.reduce((acc, permission) => acc | permission, 0n);
    builder.setDefaultMemberPermissions(combined.toString());
  }

  return builder.toJSON();
}

/**
 * Central command registry. The same definitions power prefix commands, slash
 * commands and the generated manifest.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly aliases = new Map<string, string>();

  register(command: CommandDefinition): void {
    if (!/^[a-z0-9-]{1,32}$/.test(command.name)) {
      throw new Error(`Invalid command name: ${command.name}`);
    }
    if (this.commands.has(command.name)) throw new Error(`Duplicate command: ${command.name}`);
    for (const alias of command.aliases ?? []) {
      if (this.commands.has(alias)) throw new Error(`Alias ${alias} collides with a command`);
      if (this.aliases.has(alias)) throw new Error(`Duplicate alias: ${alias}`);
      this.aliases.set(alias, command.name);
    }
    this.commands.set(command.name, command);
  }

  registerAll(commands: CommandDefinition[]): void {
    for (const command of commands) this.register(command);
  }

  get(nameOrAlias: string): CommandDefinition | undefined {
    const direct = this.commands.get(nameOrAlias.toLowerCase());
    if (direct) return direct;
    const canonical = this.aliases.get(nameOrAlias.toLowerCase());
    return canonical ? this.commands.get(canonical) : undefined;
  }

  all(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  count(): number {
    return this.commands.size;
  }

  aliasCount(): number {
    return this.aliases.size;
  }

  byCategory(): Record<string, CommandDefinition[]> {
    const grouped: Record<string, CommandDefinition[]> = {};
    for (const command of this.commands.values()) (grouped[command.category] ??= []).push(command);
    for (const list of Object.values(grouped)) list.sort((a, b) => a.name.localeCompare(b.name));
    return grouped;
  }

  /** Slash commands are capped at Discord's 100-command limit. */
  slashCommands(limit = 100): CommandDefinition[] {
    return this.slashCatalogue().slice(0, limit);
  }

  /**
   * Commands past the global 100-command cap. Discord allows another 100
   * guild-scoped commands per server, so the overflow is registered there.
   */
  slashOverflow(limit = 100): CommandDefinition[] {
    return this.slashCatalogue().slice(limit, limit * 2);
  }

  private slashCatalogue(): CommandDefinition[] {
    return this.all()
      .filter((command) => command.slash !== false)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  }

  manifest(): CommandManifestEntry[] {
    return this.all()
      .map((command) => ({
        name: command.name,
        description: command.description,
        category: command.category,
        aliases: command.aliases ?? [],
        usage: command.usage ?? null,
        examples: command.examples ?? [],
        level: command.level ?? PermissionLevel.Member,
        cooldownMs: command.cooldownMs ?? 3_000,
        guildOnly: command.guildOnly ?? true,
        ownerOnly: command.ownerOnly ?? false,
        slash: command.slash !== false,
        module: command.module ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  categories(): Array<{ id: CommandCategory; count: number }> {
    const counts = new Map<CommandCategory, number>();
    for (const command of this.commands.values()) {
      counts.set(command.category, (counts.get(command.category) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id));
  }

  require(nameOrAlias: string): CommandDefinition {
    const command = this.get(nameOrAlias);
    if (!command) throw new InferaError(`Unknown command: ${nameOrAlias}`, { code: "NOT_FOUND" });
    return command;
  }
}

export const registry = new CommandRegistry();
