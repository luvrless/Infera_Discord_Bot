import { createLogger } from "@infera/shared";
import type { InferaClient } from "../client";
import { sweepAutomodHistory } from "./automod";
import { sweepCooldowns } from "./command-runner";

const log = createLogger("bot:scheduler");

const TICK_MS = 30_000;

async function deliverReminders(client: InferaClient): Promise<void> {
  const due = await client.services.reminders.claimDue(25);
  for (const reminder of due) {
    const text = `⏰ Reminder: ${reminder.content}`.slice(0, 2000);
    try {
      const user = await client.users.fetch(reminder.userId);
      await user.send({ content: text, allowedMentions: { parse: [] } });
      continue;
    } catch {
      // Fall back to the channel the reminder was created in when DMs are closed.
    }
    if (!reminder.channelId) continue;
    try {
      const channel = await client.channels.fetch(reminder.channelId);
      if (channel && channel.isTextBased() && channel.isSendable()) {
        await channel.send({ content: `<@${reminder.userId}> ${text}`, allowedMentions: { users: [reminder.userId] } });
      }
    } catch (error) {
      log.warn({ err: error, reminderId: reminder.id }, "reminder delivery failed");
    }
  }
  if (due.length > 0) log.info({ delivered: due.length }, "reminders delivered");
}

/** Claim and run due database tasks: temporary bans, timeouts and the like. */
export function startScheduler(client: InferaClient): NodeJS.Timeout {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const processed = await client.services.scheduler.processScheduledTasks(25);
      if (processed > 0) log.info({ processed }, "scheduled tasks processed");
      await deliverReminders(client);
      sweepCooldowns();
      sweepAutomodHistory();
    } catch (error) {
      log.error({ err: error }, "scheduler tick failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
  return timer;
}
