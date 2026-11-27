import { randomInt } from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const EIGHT_BALL = [
  "It is certain.",
  "Without a doubt.",
  "You may rely on it.",
  "Yes, definitely.",
  "Most likely.",
  "Outlook good.",
  "Ask again later.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My sources say no.",
  "Very doubtful.",
];

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "There are 10 types of people in the world: those who understand binary and those who don't.",
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
  "Debugging: being the detective in a crime movie where you are also the murderer.",
];

const FACTS = [
  "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that is still edible.",
  "Octopuses have three hearts and blue blood.",
  "Bananas are berries, while strawberries are not.",
  "A day on Venus is longer than a year on Venus.",
  "Sharks existed before trees.",
];

const QUOTES = [
  "Simplicity is prerequisite for reliability. — Edsger W. Dijkstra",
  "Make it work, make it right, make it fast. — Kent Beck",
  "First, solve the problem. Then, write the code. — John Johnson",
  "Talk is cheap. Show me the code. — Linus Torvalds",
];

const ROASTS = [
  "You bring everyone so much joy... when you leave the voice channel.",
  "I'd agree with you, but then we'd both be wrong.",
  "You're the reason the gene pool needs a lifeguard.",
  "Somewhere out there is a tree tirelessly producing oxygen for you. You owe it an apology.",
];

const COMPLIMENTS = [
  "You have a great sense of humor and make this server better.",
  "Your energy is genuinely contagious in the best way.",
  "You're sharper than you give yourself credit for.",
  "People genuinely enjoy having you around.",
];

const WYR = [
  ["Have unlimited Discord Nitro forever", "Never hit a single lag spike in any game ever again"],
  ["Know every programming language fluently", "Speak every human language fluently"],
  ["Always know when someone is lying", "Get away with any harmless prank"],
  ["Live without music for a year", "Live without gaming for a year"],
];

const TRIVIA = [
  { q: "Which planet is known as the Red Planet?", a: "Mars" },
  { q: "What does HTTP stand for?", a: "HyperText Transfer Protocol" },
  { q: "How many bits are in a byte?", a: "8" },
  { q: "Which gas do plants primarily absorb for photosynthesis?", a: "Carbon dioxide (CO2)" },
];

function deterministicScore(a: string, b: string): number {
  const combined = [a, b].sort().join(":");
  let hash = 0;
  for (let i = 0; i < combined.length; i += 1) {
    hash = (hash * 31 + combined.charCodeAt(i)) % 101;
  }
  return hash;
}

const fun: CommandDefinition[] = [
  {
    name: "rate",
    description: "Rate anything from 0 to 100.",
    category: "fun",
    usage: "rate <thing>",
    cooldownMs: 2_000,
    slash: true,
    slashOptions: [{ name: "thing", description: "What to rate", type: "string", required: true }],
    async execute(ctx) {
      const thing = ctx.args.join(" ").trim() || ctx.user.username;
      const score = deterministicScore(thing.toLowerCase(), "rate");
      return ctx.ok(`I rate **${thing}** a **${score}/100**.`);
    },
  },
  {
    name: "iq",
    description: "Check someone's completely scientific IQ score.",
    category: "fun",
    usage: "iq [@user]",
    cooldownMs: 2_000,
    slash: true,
    slashOptions: [{ name: "user", description: "Target user", type: "user", required: false }],
    async execute(ctx) {
      const target = await ctx.resolveUser(ctx.args[0]) ?? ctx.user;
      const score = 70 + (deterministicScore(target.id, "iq") % 95);
      return ctx.ok(`**${target.username}**'s IQ is **${score}**.`);
    },
  },
  {
    name: "uwuify",
    description: "Convert text into uwu-speak.",
    category: "fun",
    aliases: ["uwu"],
    usage: "uwuify <text>",
    cooldownMs: 2_000,
    slash: true,
    slashOptions: [{ name: "text", description: "Text to uwuify", type: "string", required: true }],
    async execute(ctx) {
      const text = ctx.args.join(" ").trim();
      if (!text) return ctx.error("Provide some text to uwuify.");
      const out = text
        .replace(/[rl]/g, "w")
        .replace(/[RL]/g, "W")
        .replace(/n([aeiou])/gi, "ny$1")
        .replace(/ove/gi, "uv");
      return ctx.reply({ content: `${out.slice(0, 1900)} uwu`, allowedMentions: { parse: [] } });
    },
  },
  {
    name: "roll",
    description: "Roll a die (default d6, or specify sides).",
    category: "fun",
    usage: "roll [sides]",
    cooldownMs: 2_000,
    slash: true,
    slashOptions: [{ name: "sides", description: "Number of sides", type: "integer", required: false, min: 2, max: 10000 }],
    async execute(ctx) {
      const sides = Math.max(2, Math.min(10_000, Number(ctx.args[0] ?? 6) || 6));
      return ctx.ok(`🎲 Rolled **${randomInt(1, sides)}** (1-${sides}).`);
    },
  },
  {
    name: "joke",
    description: "Tell a random programmer joke.",
    category: "fun",
    aliases: ["dadjoke"],
    cooldownMs: 3_000,
    slash: true,
    async execute(ctx) {
      return ctx.ok(JOKES[randomInt(0, JOKES.length - 1)]!);
    },
  },
  {
    name: "fact",
    description: "Share a random interesting fact.",
    category: "fun",
    cooldownMs: 3_000,
    slash: true,
    async execute(ctx) {
      return ctx.ok(FACTS[randomInt(0, FACTS.length - 1)]!);
    },
  },
  {
    name: "quote",
    description: "Share an inspiring engineering quote.",
    category: "fun",
    cooldownMs: 3_000,
    slash: true,
    async execute(ctx) {
      return ctx.ok(QUOTES[randomInt(0, QUOTES.length - 1)]!);
    },
  },
  {
    name: "roast",
    description: "Send a lighthearted roast.",
    category: "fun",
    usage: "roast [@user]",
    cooldownMs: 3_000,
    slash: true,
    slashOptions: [{ name: "user", description: "Target user", type: "user", required: false }],
    async execute(ctx) {
      const target = (await ctx.resolveUser(ctx.args[0])) ?? ctx.user;
      const line = ROASTS[randomInt(0, ROASTS.length - 1)]!;
      return ctx.reply({ content: `<@${target.id}> ${line}`, allowedMentions: { parse: ["users"] } });
    },
  },
  {
    name: "compliment",
    description: "Send a genuine compliment to someone.",
    category: "fun",
    usage: "compliment [@user]",
    cooldownMs: 3_000,
    slash: true,
    slashOptions: [{ name: "user", description: "Target user", type: "user", required: false }],
    async execute(ctx) {
      const target = (await ctx.resolveUser(ctx.args[0])) ?? ctx.user;
      const line = COMPLIMENTS[randomInt(0, COMPLIMENTS.length - 1)]!;
      return ctx.reply({ content: `<@${target.id}> ${line}`, allowedMentions: { parse: ["users"] } });
    },
  },
  {
    name: "wouldyourather",
    description: "Get a Would You Rather question.",
    category: "fun",
    aliases: ["wyr"],
    cooldownMs: 3_000,
    slash: true,
    async execute(ctx) {
      const [a, b] = WYR[randomInt(0, WYR.length - 1)]!;
      return ctx.reply({
        embeds: [embed({ title: "Would You Rather...", description: `🅰️ ${a}\n\n🅱️ ${b}` })],
      });
    },
  },
  {
    name: "trivia",
    description: "Get a quick trivia question with a spoiler answer.",
    category: "games",
    cooldownMs: 3_000,
    slash: true,
    async execute(ctx) {
      const item = TRIVIA[randomInt(0, TRIVIA.length - 1)]!;
      return ctx.reply({
        embeds: [embed({ title: "Trivia", description: `${item.q}\n\nAnswer: ||${item.a}||` })],
      });
    },
  },
  ...[
    { name: "hug", verb: "hugs" },
    { name: "pat", verb: "pats" },
    { name: "slap", verb: "playfully slaps" },
    { name: "cuddle", verb: "cuddles" },
    { name: "bonk", verb: "bonks" },
    { name: "highfive", verb: "high-fives" },
  ].map(
    (action): CommandDefinition => ({
      name: action.name,
      description: `Fictional roleplay: ${action.name} another user.`,
      category: "fun",
      usage: `${action.name} <@user>`,
      cooldownMs: 2_000,
      slash: true,
      slashOptions: [{ name: "user", description: "Target user", type: "user", required: true }],
      async execute(ctx) {
        const target = await ctx.resolveUser(ctx.args[0]);
        if (!target) return ctx.error("Mention a user first.");
        return ctx.reply({
          embeds: [embed({ description: `**${ctx.user.username}** ${action.verb} **${target.username}**!` })],
        });
      },
    }),
  ),
];

export default fun;
