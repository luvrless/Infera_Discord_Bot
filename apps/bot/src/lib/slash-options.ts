import type { CommandDefinition, SlashOption } from "@infera/commands";
import type { ChatInputCommandInteraction } from "discord.js";

function readOption(interaction: ChatInputCommandInteraction, option: SlashOption): string {
  switch (option.type) {
    case "string":
      return interaction.options.getString(option.name) ?? "";
    case "integer": {
      const value = interaction.options.getInteger(option.name);
      return value === null ? "" : String(value);
    }
    case "number": {
      const value = interaction.options.getNumber(option.name);
      return value === null ? "" : String(value);
    }
    case "boolean": {
      const value = interaction.options.getBoolean(option.name);
      return value === null ? "" : String(value);
    }
    case "user":
      return interaction.options.getUser(option.name)?.id ?? "";
    case "member": {
      const member = interaction.options.getMember(option.name);
      if (member && "user" in member) return member.user.id;
      return interaction.options.getUser(option.name)?.id ?? "";
    }
    case "channel":
      return interaction.options.getChannel(option.name)?.id ?? "";
    case "role":
      return interaction.options.getRole(option.name)?.id ?? "";
    default:
      return "";
  }
}

/**
 * Slash options become positional arguments in declaration order. Missing
 * optional options stay as empty strings so positions do not shift, and
 * trailing empties are dropped.
 */
export function collectSlashArgs(
  interaction: ChatInputCommandInteraction,
  command: CommandDefinition,
): string[] {
  const args = (command.slashOptions ?? []).map((option) => readOption(interaction, option));
  while (args.length > 0 && args[args.length - 1] === "") args.pop();
  return args;
}
