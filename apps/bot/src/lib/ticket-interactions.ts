import { DEFAULT_FORM_QUESTION, createLogger } from "@infera/shared";
import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { InferaClient } from "../client";

const log = createLogger("bot:tickets");

type Category = Awaited<ReturnType<InferaClient["services"]["tickets"]["category"]>>;

function questionsFor(category: Category, forceForm: boolean) {
  if (category.settings.questions.length > 0) return category.settings.questions.slice(0, 5);
  return forceForm ? [DEFAULT_FORM_QUESTION] : [];
}

function formModal(category: Category, forceForm: boolean): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`tkt:f:${category.id}`).setTitle(category.name.slice(0, 45) || "Open a ticket");
  for (const question of questionsFor(category, forceForm)) {
    const label = new LabelBuilder().setLabel(question.label.slice(0, 45));
    if (question.description) label.setDescription(question.description.slice(0, 100));
    if ((question.type === "select" || question.type === "multi") && question.options.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(question.id)
        .setRequired(question.required)
        .setMinValues(question.required ? 1 : 0)
        .setMaxValues(question.type === "multi" ? Math.min(question.options.length, 25) : 1)
        .addOptions(question.options.slice(0, 25).map((option, index) => new StringSelectMenuOptionBuilder().setLabel(option.slice(0, 100)).setValue(`${index}`)));
      if (question.placeholder) select.setPlaceholder(question.placeholder.slice(0, 150));
      label.setStringSelectMenuComponent(select);
    } else {
      const input = new TextInputBuilder()
        .setCustomId(question.id)
        .setStyle(question.type === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(question.required)
        .setMaxLength(Math.max(1, Math.min(question.max, question.type === "paragraph" ? 4000 : 1000)));
      if (question.min > 0) input.setMinLength(Math.min(question.min, question.max));
      if (question.placeholder) input.setPlaceholder(question.placeholder.slice(0, 100));
      label.setTextInputComponent(input);
    }
    modal.addLabelComponents(label);
  }
  return modal;
}

async function openTicket(
  client: InferaClient,
  interaction: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached"> | ModalSubmitInteraction<"cached">,
  category: Category,
  answers?: Array<{ question: string; answer: string }>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const ticket = await client.services.tickets.create({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      username: interaction.member.displayName || interaction.user.username,
      categoryId: category.id,
      answers,
      avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
      accountCreatedAt: interaction.user.createdTimestamp,
      joinedAt: interaction.member.joinedTimestamp ?? null,
    });
    await interaction.editReply({ content: `Your ticket is ready: <#${ticket.channelId}>` });
  } catch (error) {
    await interaction.editReply({ content: error instanceof Error ? error.message : "The ticket could not be created." });
  }
}

async function startCategory(
  client: InferaClient,
  interaction: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached">,
  categoryId: string,
  forceForm = false,
): Promise<void> {
  const category = await client.services.tickets.category(interaction.guildId, categoryId).catch(() => null);
  if (!category) {
    await interaction.reply({ content: "That ticket option no longer exists.", ephemeral: true });
    return;
  }
  if (questionsFor(category, forceForm).length > 0) {
    await interaction.showModal(formModal(category, forceForm));
    return;
  }
  await openTicket(client, interaction, category);
}

function memberInfo(interaction: ButtonInteraction<"cached"> | ModalSubmitInteraction<"cached">) {
  return {
    id: interaction.user.id,
    roles: [...interaction.member.roles.cache.keys()],
    manageChannels: Boolean(interaction.memberPermissions?.has("ManageChannels")),
  };
}

async function closeReasonModal(client: InferaClient, interaction: ButtonInteraction<"cached">, ticketId: string) {
  const reasons = await client.services.config.getValue<string[]>(interaction.guildId, "tickets.close_reasons").catch(() => [] as string[]);
  const modal = new ModalBuilder().setCustomId(`tkt:x:${ticketId}`).setTitle("Close ticket");
  if (reasons.length > 0) {
    modal.addLabelComponents(
      new LabelBuilder().setLabel("Reason").setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("preset")
          .setRequired(false)
          .setMinValues(0)
          .setMaxValues(1)
          .setPlaceholder("Choose a reason")
          .addOptions(reasons.slice(0, 25).map((reason, index) => new StringSelectMenuOptionBuilder().setLabel(reason.slice(0, 100)).setValue(String(index)))),
      ),
    );
  }
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(reasons.length ? "Details (optional)" : "Reason (optional)")
      .setTextInputComponent(new TextInputBuilder().setCustomId("reason").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
  );
  await interaction.showModal(modal);
}

/**
 * Handles every ticket interaction. Returns true when the interaction was a
 * ticket interaction (handled or rejected), false otherwise.
 */
export async function handleTicketInteraction(client: InferaClient, interaction: Interaction): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const tickets = client.services.tickets;

  try {
    // Panel buttons and dropdown.
    if (interaction.isButton() && interaction.customId.startsWith("tkt:c:")) {
      await startCategory(client, interaction, interaction.customId.slice(6));
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith("tkt:fc:")) {
      await startCategory(client, interaction, interaction.customId.slice(7), true);
      return true;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("tkt:s:")) {
      const categoryId = interaction.values[0];
      if (categoryId) await startCategory(client, interaction, categoryId);
      // Reset the visible selection so the same option can be picked again.
      await interaction.message.edit({ components: interaction.message.components }).catch(() => undefined);
      return true;
    }

    // Form submitted.
    if (interaction.isModalSubmit() && interaction.customId.startsWith("tkt:f:")) {
      const category = await tickets.category(interaction.guildId, interaction.customId.slice(6));
      const questions = category.settings.questions.length ? category.settings.questions : [DEFAULT_FORM_QUESTION];
      const answers = questions.map((question) => {
        let answer = "";
        if (question.type === "select" || question.type === "multi") {
          const values = interaction.fields.getStringSelectValues(question.id);
          answer = values.map((value) => question.options[Number(value)] ?? value).join(", ");
        } else {
          answer = interaction.fields.getTextInputValue(question.id);
        }
        return { question: question.label, answer };
      });
      await openTicket(client, interaction, category, answers);
      return true;
    }

    // Close with reason submitted.
    if (interaction.isModalSubmit() && interaction.customId.startsWith("tkt:x:")) {
      const ticketId = interaction.customId.slice(6);
      const ticket = await tickets.get(interaction.guildId, ticketId);
      if (!(await tickets.canAct(ticket, "close", memberInfo(interaction)))) {
        await interaction.reply({ content: "You can't close this ticket.", ephemeral: true });
        return true;
      }
      const reasons = await client.services.config.getValue<string[]>(interaction.guildId, "tickets.close_reasons").catch(() => [] as string[]);
      let preset = "";
      try {
        const picked = interaction.fields.getStringSelectValues("preset")[0];
        preset = picked !== undefined ? reasons[Number(picked)] ?? "" : "";
      } catch {
        preset = "";
      }
      let details = "";
      try {
        details = interaction.fields.getTextInputValue("reason").trim();
      } catch {
        details = "";
      }
      const reason = [preset, details].filter(Boolean).join(" — ") || undefined;
      await interaction.reply({ content: `Closing ticket **#${ticket.number}**…`, ephemeral: true });
      await tickets.close(interaction.guildId, ticketId, interaction.user.id, reason);
      return true;
    }

    // In-ticket controls.
    if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
      const [, action, ticketId] = interaction.customId.split(":");
      if (!ticketId || !["claim", "close", "reopen", "delete"].includes(action ?? "")) return false;
      const ticket = await tickets.get(interaction.guildId, ticketId);
      const member = memberInfo(interaction);
      if (action === "claim") {
        if (!(await tickets.canAct(ticket, "claim", member))) {
          await interaction.reply({ content: "Only ticket staff can claim this ticket.", ephemeral: true });
          return true;
        }
        if (ticket.claimedBy === interaction.user.id) {
          await tickets.unclaim(interaction.guildId, ticketId, interaction.user.id);
          await interaction.reply({ content: "You unclaimed this ticket.", ephemeral: true });
          return true;
        }
        await tickets.claim(interaction.guildId, ticketId, interaction.user.id);
        await interaction.reply({ content: `Ticket **#${ticket.number}** claimed. Press Claim again to unclaim.`, ephemeral: true });
        return true;
      }
      if (action === "close") {
        if (!(await tickets.canAct(ticket, "close", member))) {
          await interaction.reply({ content: "You can't close this ticket.", ephemeral: true });
          return true;
        }
        await closeReasonModal(client, interaction, ticketId);
        return true;
      }
      if (!(await tickets.canAct(ticket, "manage", member))) {
        await interaction.reply({ content: "Only ticket staff can do that.", ephemeral: true });
        return true;
      }
      if (action === "reopen") {
        await interaction.deferUpdate();
        await tickets.reopen(interaction.guildId, ticketId, interaction.user.id);
        return true;
      }
      await interaction.reply({ content: "Deleting this ticket…", ephemeral: true });
      await tickets.deleteTicket(interaction.guildId, ticketId, interaction.user.id);
      return true;
    }
  } catch (error) {
    log.warn({ err: error, customId: "customId" in interaction ? interaction.customId : null }, "ticket interaction failed");
    const message = error instanceof Error ? error.message : "That ticket action could not be completed.";
    if (interaction.isRepliable()) {
      if (interaction.deferred) await interaction.editReply({ content: message }).catch(() => undefined);
      else if (!interaction.replied) await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
    }
    return true;
  }
  return false;
}

