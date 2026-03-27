import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits
} from "discord.js";
import fs from "fs";
import path from "path";
import http from "http";

// ==============================
// LOGS GLOBAIS
// ==============================
process.on("uncaughtException", err => {
  console.error("❌ uncaughtException:", err);
});

process.on("unhandledRejection", err => {
  console.error("❌ unhandledRejection:", err);
});

// ==============================
// WEB SERVER (RENDER)
// ==============================
const PORT = process.env.PORT || 10000;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("MetaBot online");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web ativo na porta ${PORT}`);
  });

// ==============================
// ENV
// ==============================
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ==============================
// IDS
// ==============================
const ROLE_IMPERIO = "1423052122936573992";
const ROLE_CHEFE = "1422984664812884168";
const ROLE_SUBCHEFE = "1422986843074592928";

const CANAL_META = "1486872553900474592";
const CANAL_META_TRABALHADOR = "1423267456733941861";
const CANAL_LOGS_META = "1486862590964400149";
const CANAL_REGISTO_MEMBROS = "1486862508219306069";

const CATEGORIA_META_INDIVIDUAL = "1438935701973368884";

const DATA_FILE = path.join(process.cwd(), "metabot-data.json");

// ==============================
// DATA
// ==============================
function defaultData() {
  return {
    members: {},
    activeMeta: null,
    lastWorkerDispatch: null
  };
}

function loadDataFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return defaultData();
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    console.error("❌ Erro a ler metabot-data.json:", err);
    return defaultData();
  }
}

const DB = loadDataFromFile();

function saveData(reason = "sem motivo") {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2), "utf8");
    console.log(
      `💾 saveData (${reason}) | activeMeta=${
        DB.activeMeta ? DB.activeMeta.id : "null"
      }`
    );
  } catch (err) {
    console.error("❌ Erro a gravar metabot-data.json:", err);
  }
}

// ==============================
// CLIENT
// ==============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// ==============================
// UTIL
// ==============================
function nowISO() {
  return new Date().toISOString();
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hh}:${mm}`;
}

function normalizeChannelName(name) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 90) || "membro"
  );
}

function isChefe(member) {
  return member.roles.cache.has(ROLE_CHEFE);
}

function canReact(member) {
  return (
    member.roles.cache.has(ROLE_CHEFE) ||
    member.roles.cache.has(ROLE_SUBCHEFE)
  );
}

function isMetaChannel(interaction) {
  return interaction.channelId === CANAL_META;
}

function ensureMemberEntry(member) {
  if (!DB.members[member.id]) {
    DB.members[member.id] = {
      userId: member.id,
      serverName: member.displayName,
      username: member.user.username,
      channelId: null,
      registryMessageId: null,
      receivedImperioAt: nowISO(),
      lastMetaAt: null
    };
  }
  return DB.members[member.id];
}

// ==============================
// REGISTO DE MEMBROS
// ==============================
function buildRegistryMessage(entry) {
  return [
    `Nome servidor: ${entry.serverName}`,
    `Nome utilizador: ${entry.username}`,
    `ID: ${entry.userId}`,
    `Canal: ${entry.channelId ? `<#${entry.channelId}>` : "-"}`,
    `Recebeu cargo Imperio: ${
      entry.receivedImperioAt ? formatDate(entry.receivedImperioAt) : "-"
    }`,
    `Ultima meta: ${entry.lastMetaAt ? formatDate(entry.lastMetaAt) : "-"}`
  ].join("\n");
}

async function updateRegistryMessage(guild, userId) {
  const entry = DB.members[userId];
  if (!entry) return;

  const canal = await guild.channels.fetch(CANAL_REGISTO_MEMBROS).catch(() => null);
  if (!canal || !canal.isTextBased()) return;

  const content = "```" + buildRegistryMessage(entry) + "```";

  if (entry.registryMessageId) {
    const msg = await canal.messages.fetch(entry.registryMessageId).catch(() => null);
    if (msg) {
      await msg.edit(content).catch(console.error);
      return;
    }
  }

  const nova = await canal.send(content).catch(console.error);
  if (nova) {
    entry.registryMessageId = nova.id;
    saveData("updateRegistryMessage nova mensagem");
  }
}

// ==============================
// CANAIS INDIVIDUAIS
// ==============================
async function findMemberChannel(guild, member) {
  const entry = DB.members[member.id];

  if (entry?.channelId) {
    const byId = await guild.channels.fetch(entry.channelId).catch(() => null);
    if (byId) return byId;
  }

  const desiredName = normalizeChannelName(member.displayName);

  const byName = guild.channels.cache.find(
    ch =>
      ch.parentId === CATEGORIA_META_INDIVIDUAL &&
      ch.type === ChannelType.GuildText &&
      ch.name === desiredName
  );
  if (byName) return byName;

  const byPerm = guild.channels.cache.find(
    ch =>
      ch.parentId === CATEGORIA_META_INDIVIDUAL &&
      ch.type === ChannelType.GuildText &&
      ch.permissionOverwrites.cache.has(member.id)
  );
  if (byPerm) return byPerm;

  const byTopic = guild.channels.cache.find(
    ch =>
      ch.parentId === CATEGORIA_META_INDIVIDUAL &&
      ch.type === ChannelType.GuildText &&
      ch.topic?.includes(`USER:${member.id}`)
  );
  return byTopic || null;
}

async function createOrUpdateMemberChannel(member) {
  const entry = ensureMemberEntry(member);

  const guild = member.guild;
  const name = normalizeChannelName(member.displayName);

  let channel = await findMemberChannel(guild, member);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: ["ViewChannel"]
    },
    {
      id: member.id,
      allow: ["ViewChannel", "ReadMessageHistory"],
      deny: ["SendMessages", "AddReactions"]
    },
    {
      id: ROLE_CHEFE,
      allow: ["ViewChannel", "ReadMessageHistory", "AddReactions"],
      deny: ["SendMessages"]
    },
    {
      id: ROLE_SUBCHEFE,
      allow: ["ViewChannel", "ReadMessageHistory", "AddReactions"],
      deny: ["SendMessages"]
    },
    {
      id: client.user.id,
      allow: [
        "ViewChannel",
        "SendMessages",
        "ReadMessageHistory",
        "ManageMessages",
        "AddReactions"
      ]
    }
  ];

  if (!channel) {
    console.log(`🆕 Criar canal individual para ${member.user.tag}`);
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: CATEGORIA_META_INDIVIDUAL,
      permissionOverwrites: overwrites,
      topic: `USER:${member.id}`
    });
  } else {
    console.log(`♻️ Atualizar canal individual para ${member.user.tag}`);
    await channel
      .edit({
        name,
        parent: CATEGORIA_META_INDIVIDUAL,
        permissionOverwrites: overwrites,
        topic: `USER:${member.id}`
      })
      .catch(console.error);
  }

  entry.channelId = channel.id;
  entry.serverName = member.displayName;
  entry.username = member.user.username;

  saveData("createOrUpdateMemberChannel");
  await updateRegistryMessage(guild, member.id);
}

async function deleteMemberChannel(guild, userId) {
  console.log(`🗑️ Apagar canal do ${userId}`);

  const channel = guild.channels.cache.find(
    ch =>
      ch.parentId === CATEGORIA_META_INDIVIDUAL &&
      ch.type === ChannelType.GuildText &&
      (ch.permissionOverwrites.cache.has(userId) ||
        ch.topic?.includes(`USER:${userId}`))
  );

  if (!channel) {
    console.log("❌ Canal não encontrado");
  } else {
    await channel
      .delete("Perdeu cargo Imperio ou saiu do servidor")
      .catch(err => {
        console.error("❌ Erro ao apagar:", err);
      });
    console.log("✅ Canal apagado");
  }

  if (DB.members[userId]) {
    DB.members[userId].channelId = null;
    saveData("deleteMemberChannel");
    await updateRegistryMessage(guild, userId);
  }
}

// ==============================
// COMANDOS SLASH
// ==============================
const commands = [
  new SlashCommandBuilder()
    .setName("meta")
    .setDescription("Gestao das metas")
    .addSubcommand(sub =>
      sub
        .setName("global")
        .setDescription(
          "Envia a meta para todos os canais individuais e abre a meta"
        )
        .addStringOption(opt =>
          opt.setName("texto").setDescription("Texto da meta").setRequired(true)
        )
        .addAttachmentOption(opt =>
          opt
            .setName("imagem")
            .setDescription("Imagem opcional")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("individual")
        .setDescription(
          "Envia a meta para uma pessoa e adiciona aos logs da meta ativa"
        )
        .addUserOption(opt =>
          opt
            .setName("pessoa")
            .setDescription("Pessoa alvo")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName("texto").setDescription("Texto da meta").setRequired(true)
        )
        .addAttachmentOption(opt =>
          opt
            .setName("imagem")
            .setDescription("Imagem opcional")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("trabalhador")
        .setDescription("Envia a meta para o canal dos trabalhadores")
        .addStringOption(opt =>
          opt.setName("texto").setDescription("Texto da meta").setRequired(true)
        )
        .addAttachmentOption(opt =>
          opt
            .setName("imagem")
            .setDescription("Imagem opcional")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("fim")
    .setDescription("Fecho de metas")
    .addSubcommand(sub =>
      sub.setName("meta").setDescription("Fecha a meta ativa e gera o log final")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("limpar")
    .setDescription("Limpeza de metas")
    .addSubcommandGroup(group =>
      group
        .setName("meta")
        .setDescription("Limpeza de metas")
        .addSubcommand(sub =>
          sub.setName("global").setDescription("Limpa a última meta global enviada")
        )
        .addSubcommand(sub =>
          sub
            .setName("individual")
            .setDescription("Limpa a última meta individual de uma pessoa")
            .addUserOption(opt =>
              opt
                .setName("pessoa")
                .setDescription("Pessoa alvo")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("trabalhador")
            .setDescription("Limpa a última meta dos trabalhadores")
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

async function registerCommands() {
  if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("❌ Falta BOT_TOKEN, CLIENT_ID ou GUILD_ID.");
    return;
  }

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });
    console.log("✅ Slash commands registados no servidor.");
  } catch (err) {
    console.error("❌ Erro a registar slash commands:", err);
  }
}

// ==============================
// META ATIVA / LOGS
// ==============================
function getEffectiveStatus(participant) {
  if (participant.votes?.chefe === "entregou") return "entregou";
  if (participant.votes?.chefe === "nao_entregou") return "nao_entregou";
  if (participant.votes?.subchefe === "entregou") return "entregou";
  if (participant.votes?.subchefe === "nao_entregou") return "nao_entregou";
  return "pendente";
}

function ensureActiveMetaParticipant(meta, memberEntry) {
  if (!meta.participants[memberEntry.userId]) {
    meta.participants[memberEntry.userId] = {
      userId: memberEntry.userId,
      messageIds: [],
      votes: {
        chefe: null,
        subchefe: null
      }
    };
  }
  return meta.participants[memberEntry.userId];
}

function buildMetaLog(meta) {
  const participantes = Object.values(meta.participants);

  const entregou = participantes.filter(
    p => getEffectiveStatus(p) === "entregou"
  );
  const naoEntregou = participantes.filter(
    p => getEffectiveStatus(p) === "nao_entregou"
  );
  const pendente = participantes.filter(
    p => getEffectiveStatus(p) === "pendente"
  );

  const lines = [];
  lines.push(
    `📅 Meta — ${formatDate(meta.startedAt)} → ${
      meta.endedAt ? formatDate(meta.endedAt) : "-"
    }`
  );
  lines.push("");

  lines.push("✅ Entregou");
  if (entregou.length === 0) {
    lines.push("- Nenhum");
  } else {
    for (const p of entregou) lines.push(`- <@${p.userId}>`);
  }

  lines.push("");
  lines.push("❌ Não entregou");
  if (naoEntregou.length === 0) {
    lines.push("- Nenhum");
  } else {
    for (const p of naoEntregou) lines.push(`- <@${p.userId}>`);
  }

  lines.push("");
  lines.push("🕓 Pendente");
  if (pendente.length === 0) {
    lines.push("- Nenhum");
  } else {
    for (const p of pendente) lines.push(`- <@${p.userId}>`);
  }

  return lines.join("\n");
}

async function createOrUpdateMetaLogMessage(guild) {
  const meta = DB.activeMeta;
  if (!meta) {
    console.log("ℹ️ createOrUpdateMetaLogMessage sem activeMeta");
    return;
  }

  const canal = await guild.channels.fetch(CANAL_LOGS_META).catch(() => null);
  if (!canal || !canal.isTextBased()) return;

  const content = buildMetaLog(meta);

  if (meta.logMessageId) {
    const msg = await canal.messages.fetch(meta.logMessageId).catch(() => null);
    if (msg) {
      await msg.edit(content).catch(console.error);
      console.log("📝 Log de meta editado");
      return;
    }
  }

  const nova = await canal.send(content).catch(console.error);
  if (nova) {
    meta.logMessageId = nova.id;
    saveData("createOrUpdateMetaLogMessage nova");
    console.log("📝 Log de meta criado");
  }
}

// ==============================
// ENVIO DE METAS
// ==============================
async function sendMetaMessage(channel, texto, imagem) {
  const payload = imagem
    ? { content: texto, files: [imagem.url] }
    : { content: texto };

  return channel.send(payload);
}

async function handleMetaGlobal(interaction) {
  const texto = interaction.options.getString("texto", true);
  const imagem = interaction.options.getAttachment("imagem");
  const guild = interaction.guild;

  console.log("➡️ /meta global");

  if (DB.activeMeta && !DB.activeMeta.endedAt) {
    return interaction.reply({
      content: "❌ Já existe uma meta ativa. Usa /fim meta antes de abrir outra.",
      ephemeral: true
    });
  }

  DB.activeMeta = {
    id: `meta_${Date.now()}`,
    startedAt: nowISO(),
    endedAt: null,
    logMessageId: null,
    mainMessageIds: [],
    items: [],
    participants: {}
  };
  saveData("/meta global criou activeMeta");

  const canalMeta = await guild.channels.fetch(CANAL_META).catch(() => null);
  if (!canalMeta || !canalMeta.isTextBased()) {
    DB.activeMeta = null;
    saveData("/meta global rollback canal meta");
    return interaction.reply({
      content: "❌ Não consegui aceder ao canal meta.",
      ephemeral: true
    });
  }

  const mainMsg = await sendMetaMessage(canalMeta, texto, imagem).catch(() => null);
  if (!mainMsg) {
    DB.activeMeta = null;
    saveData("/meta global rollback enviar principal");
    return interaction.reply({
      content: "❌ Não consegui enviar a meta no canal principal.",
      ephemeral: true
    });
  }

  DB.activeMeta.mainMessageIds.push(mainMsg.id);

  const imperioMembers = guild.members.cache.filter(
    m => !m.user.bot && m.roles.cache.has(ROLE_IMPERIO)
  );

  for (const [, member] of imperioMembers) {
    const entry = ensureMemberEntry(member);
    entry.serverName = member.displayName;
    entry.username = member.user.username;

    if (!entry.channelId) {
      await createOrUpdateMemberChannel(member);
    }

    const channel = entry.channelId
      ? await guild.channels.fetch(entry.channelId).catch(() => null)
      : null;

    if (!channel || !channel.isTextBased()) continue;

    const msg = await sendMetaMessage(channel, texto, imagem).catch(() => null);
    if (!msg) continue;

    const participant = ensureActiveMetaParticipant(DB.activeMeta, entry);
    participant.messageIds.push(msg.id);
    entry.lastMetaAt = nowISO();
    saveData("/meta global participant");
    await updateRegistryMessage(guild, member.id);
  }

  DB.activeMeta.items.push({
    type: "global",
    targetUserId: null,
    mainMessageId: mainMsg.id
  });

  saveData("/meta global final");
  await createOrUpdateMetaLogMessage(guild);

  return interaction.reply({
    content: "✅ Meta global enviada com sucesso.",
    ephemeral: true
  });
}

async function handleMetaIndividual(interaction) {
  const user = interaction.options.getUser("pessoa", true);
  const texto = interaction.options.getString("texto", true);
  const imagem = interaction.options.getAttachment("imagem");
  const guild = interaction.guild;

  console.log("➡️ /meta individual");

  if (!DB.activeMeta || DB.activeMeta.endedAt) {
    return interaction.reply({
      content: "❌ Não existe meta ativa. Usa /meta global primeiro.",
      ephemeral: true
    });
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member || !member.roles.cache.has(ROLE_IMPERIO)) {
    return interaction.reply({
      content: "❌ Essa pessoa não tem o cargo Império.",
      ephemeral: true
    });
  }

  const canalMeta = await guild.channels.fetch(CANAL_META).catch(() => null);
  if (!canalMeta || !canalMeta.isTextBased()) {
    return interaction.reply({
      content: "❌ Não consegui aceder ao canal meta.",
      ephemeral: true
    });
  }

  const mainText = `📌 Meta individual para ${member}\n\n${texto}`;
  const mainMsg = await sendMetaMessage(canalMeta, mainText, imagem).catch(() => null);
  if (!mainMsg) {
    return interaction.reply({
      content: "❌ Não consegui enviar a meta individual no canal principal.",
      ephemeral: true
    });
  }

  const entry = ensureMemberEntry(member);
  if (!entry.channelId) {
    await createOrUpdateMemberChannel(member);
  }

  const channel = entry.channelId
    ? await guild.channels.fetch(entry.channelId).catch(() => null)
    : null;

  if (!channel || !channel.isTextBased()) {
    return interaction.reply({
      content: "❌ Não consegui aceder ao canal individual dessa pessoa.",
      ephemeral: true
    });
  }

  const msg = await sendMetaMessage(channel, texto, imagem).catch(() => null);
  if (!msg) {
    return interaction.reply({
      content: "❌ Não consegui enviar a meta individual.",
      ephemeral: true
    });
  }

  const participant = ensureActiveMetaParticipant(DB.activeMeta, entry);
  participant.messageIds.push(msg.id);

  DB.activeMeta.items.push({
    type: "individual",
    targetUserId: member.id,
    mainMessageId: mainMsg.id,
    childMessageId: msg.id
  });

  entry.lastMetaAt = nowISO();
  saveData("/meta individual final");

  await updateRegistryMessage(guild, member.id);
  await createOrUpdateMetaLogMessage(guild);

  return interaction.reply({
    content: `✅ Meta individual enviada para ${member}.`,
    ephemeral: true
  });
}

async function handleMetaTrabalhador(interaction) {
  const texto = interaction.options.getString("texto", true);
  const imagem = interaction.options.getAttachment("imagem");
  const guild = interaction.guild;

  console.log("➡️ /meta trabalhador");

  const canalMeta = await guild.channels.fetch(CANAL_META).catch(() => null);
  const canalTrabalhador = await guild.channels
    .fetch(CANAL_META_TRABALHADOR)
    .catch(() => null);

  if (
    !canalMeta ||
    !canalMeta.isTextBased() ||
    !canalTrabalhador ||
    !canalTrabalhador.isTextBased()
  ) {
    return interaction.reply({
      content: "❌ Não consegui aceder aos canais necessários.",
      ephemeral: true
    });
  }

  const mainText = `👷 Meta trabalhador\n\n${texto}`;

  const mainMsg = await sendMetaMessage(canalMeta, mainText, imagem).catch(() => null);
  const workerMsg = await sendMetaMessage(canalTrabalhador, texto, imagem).catch(
    () => null
  );

  if (!mainMsg || !workerMsg) {
    return interaction.reply({
      content: "❌ Não consegui enviar a meta trabalhador.",
      ephemeral: true
    });
  }

  DB.lastWorkerDispatch = {
    mainMessageId: mainMsg.id,
    workerMessageId: workerMsg.id
  };
  saveData("/meta trabalhador");

  return interaction.reply({
    content: "✅ Meta trabalhador enviada.",
    ephemeral: true
  });
}

// ==============================
// LIMPEZA
// ==============================
async function deleteMessageSafe(channel, messageId) {
  if (!channel || !messageId) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) await msg.delete().catch(() => {});
}

async function handleLimparMetaGlobal(interaction) {
  const meta = DB.activeMeta;

  if (!meta) {
    return interaction.reply({
      content: "❌ Não existe meta ativa.",
      ephemeral: true
    });
  }

  const globalItem = [...meta.items].reverse().find(i => i.type === "global");
  if (!globalItem) {
    return interaction.reply({
      content: "❌ Não encontrei uma meta global para limpar.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const canalMeta = await guild.channels.fetch(CANAL_META).catch(() => null);

  await deleteMessageSafe(canalMeta, globalItem.mainMessageId);

  for (const participant of Object.values(meta.participants)) {
    for (const messageId of participant.messageIds) {
      const memberEntry = DB.members[participant.userId];
      if (!memberEntry?.channelId) continue;
      const ch = await guild.channels.fetch(memberEntry.channelId).catch(() => null);
      await deleteMessageSafe(ch, messageId);
    }
    participant.messageIds = [];
    participant.votes = { chefe: null, subchefe: null };
  }

  meta.items = meta.items.filter(i => i !== globalItem);
  saveData("/limpar meta global");
  await createOrUpdateMetaLogMessage(guild);

  return interaction.reply({
    content: "✅ Meta global limpa.",
    ephemeral: true
  });
}

async function handleLimparMetaIndividual(interaction) {
  const user = interaction.options.getUser("pessoa", true);
  const meta = DB.activeMeta;

  if (!meta) {
    return interaction.reply({
      content: "❌ Não existe meta ativa.",
      ephemeral: true
    });
  }

  const item = [...meta.items].reverse().find(
    i => i.type === "individual" && i.targetUserId === user.id
  );

  if (!item) {
    return interaction.reply({
      content: "❌ Não encontrei meta individual dessa pessoa.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const canalMeta = await guild.channels.fetch(CANAL_META).catch(() => null);
  await deleteMessageSafe(canalMeta, item.mainMessageId);

  const memberEntry = DB.members[user.id];
  if (memberEntry?.channelId) {
    const ch = await guild.channels.fetch(memberEntry.channelId).catch(() => null);
    await deleteMessageSafe(ch, item.childMessageId);
  }

  const participant = meta.participants[user.id];
  if (participant) {
    participant.messageIds = participant.messageIds.filter(
      id => id !== item.childMessageId
    );
  }

  meta.items = meta.items.filter(i => i !== item);
  saveData("/limpar meta individual");
  await createOrUpdateMetaLogMessage(guild);

  return interaction.reply({
    content: `✅ Meta individual de <@${user.id}> limpa.`,
    ephemeral: true
  });
}

async function handleLimparMetaTrabalhador(interaction) {
  if (!DB.lastWorkerDispatch) {
    return interaction.reply({
      content: "❌ Não existe meta trabalhador para limpar.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const canalMeta = await guild.channels.fetch(CANAL_META).catch(() => null);
  const canalTrab = await guild.channels
    .fetch(CANAL_META_TRABALHADOR)
    .catch(() => null);

  await deleteMessageSafe(canalMeta, DB.lastWorkerDispatch.mainMessageId);
  await deleteMessageSafe(canalTrab, DB.lastWorkerDispatch.workerMessageId);

  DB.lastWorkerDispatch = null;
  saveData("/limpar meta trabalhador");

  return interaction.reply({
    content: "✅ Meta trabalhador limpa.",
    ephemeral: true
  });
}

// ==============================
// FECHAR META
// ==============================
async function handleFimMeta(interaction) {
  console.log(
    `➡️ /fim meta | activeMeta=${DB.activeMeta ? DB.activeMeta.id : "null"}`
  );

  if (!DB.activeMeta || DB.activeMeta.endedAt) {
    return interaction.reply({
      content: "❌ Não existe meta ativa para fechar.",
      ephemeral: true
    });
  }

  DB.activeMeta.endedAt = nowISO();
  saveData("/fim meta");
  await createOrUpdateMetaLogMessage(interaction.guild);

  return interaction.reply({
    content: "✅ Meta fechada com sucesso.",
    ephemeral: true
  });
}

// ==============================
// REAÇÕES
// ==============================
async function updateReactionVote(reaction, userId, action) {
  const meta = DB.activeMeta;
  if (!meta || meta.endedAt) {
    console.log("ℹ️ updateReactionVote sem meta ativa");
    return;
  }

  const emoji = reaction.emoji.name;
  if (emoji !== "✅" && emoji !== "❌") return;

  let member = null;
  try {
    member = await reaction.message.guild.members.fetch(userId);
  } catch {
    return;
  }

  if (!member || !canReact(member)) return;
  if (reaction.message.author?.id !== client.user.id) return;

  const ownerEntry = Object.values(DB.members).find(
    entry => entry.channelId === reaction.message.channelId
  );
  if (!ownerEntry) {
    console.log("❌ Não encontrei ownerEntry pelo channelId");
    return;
  }

  const participant = meta.participants[ownerEntry.userId];
  if (!participant) {
    console.log("❌ Não encontrei participant para o utilizador");
    return;
  }

  if (!participant.messageIds.includes(reaction.message.id)) {
    console.log("❌ A mensagem reagida não está associada ao participant");
    return;
  }

  const voteValue = emoji === "✅" ? "entregou" : "nao_entregou";
  const voterKey = member.roles.cache.has(ROLE_CHEFE) ? "chefe" : "subchefe";

  if (action === "add") {
    participant.votes[voterKey] = voteValue;
  } else {
    participant.votes[voterKey] = null;
  }

  console.log(
    `📝 Reação atualizada | user=${ownerEntry.userId} | voter=${voterKey} | value=${participant.votes[voterKey]}`
  );

  saveData(`reaction ${action}`);
  await createOrUpdateMetaLogMessage(reaction.message.guild);
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    await updateReactionVote(reaction, user.id, "add");
  } catch (err) {
    console.error("❌ Erro em MessageReactionAdd:", err);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    await updateReactionVote(reaction, user.id, "remove");
  } catch (err) {
    console.error("❌ Erro em MessageReactionRemove:", err);
  }
});

// ==============================
// EVENTOS DE MEMBROS
// ==============================
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const had = oldMember.roles.cache.has(ROLE_IMPERIO);
    const has = newMember.roles.cache.has(ROLE_IMPERIO);

    console.log(`🔄 ${newMember.user.tag}: ${had} -> ${has}`);

    if (!had && has) {
      const entry = ensureMemberEntry(newMember);
      entry.receivedImperioAt = nowISO();
      entry.serverName = newMember.displayName;
      entry.username = newMember.user.username;
      saveData("GuildMemberUpdate ganhou imperio");

      await createOrUpdateMemberChannel(newMember);
      return;
    }

    if (had && !has) {
      await deleteMemberChannel(newMember.guild, newMember.id);
      return;
    }

    if (has && oldMember.displayName !== newMember.displayName) {
      await createOrUpdateMemberChannel(newMember);
    }
  } catch (err) {
    console.error("❌ Erro em GuildMemberUpdate:", err);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  try {
    await deleteMemberChannel(member.guild, member.id);
  } catch (err) {
    console.error("❌ Erro em GuildMemberRemove:", err);
  }
});

// ==============================
// IGNORAR MENSAGENS NORMAIS
// ==============================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
});

// ==============================
// INTERAÇÕES
// ==============================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!isMetaChannel(interaction)) {
    return interaction.reply({
      content: `❌ Este comando só pode ser usado no canal <#${CANAL_META}>.`,
      ephemeral: true
    });
  }

  if (!isChefe(interaction.member)) {
    return interaction.reply({
      content: "❌ Não tens permissão para usar este comando.",
      ephemeral: true
    });
  }

  try {
    if (interaction.commandName === "meta") {
      const sub = interaction.options.getSubcommand();

      if (sub === "global") return handleMetaGlobal(interaction);
      if (sub === "individual") return handleMetaIndividual(interaction);
      if (sub === "trabalhador") return handleMetaTrabalhador(interaction);
    }

    if (interaction.commandName === "fim") {
      const sub = interaction.options.getSubcommand();
      if (sub === "meta") return handleFimMeta(interaction);
    }

    if (interaction.commandName === "limpar") {
      const group = interaction.options.getSubcommandGroup();
      const sub = interaction.options.getSubcommand();

      if (group === "meta" && sub === "global")
        return handleLimparMetaGlobal(interaction);
      if (group === "meta" && sub === "individual")
        return handleLimparMetaIndividual(interaction);
      if (group === "meta" && sub === "trabalhador")
        return handleLimparMetaTrabalhador(interaction);
    }
  } catch (err) {
    console.error("❌ Erro em InteractionCreate:", err);

    if (interaction.deferred || interaction.replied) {
      return interaction
        .editReply({
          content: "❌ Ocorreu um erro ao executar o comando."
        })
        .catch(() => {});
    }

    return interaction
      .reply({
        content: "❌ Ocorreu um erro ao executar o comando.",
        ephemeral: true
      })
      .catch(() => {});
  }
});

// ==============================
// READY
// ==============================
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} online`);
  console.log(
    `📦 Estado inicial | activeMeta=${DB.activeMeta ? DB.activeMeta.id : "null"}`
  );
  await registerCommands();
});

// ==============================
// START
// ==============================
if (!TOKEN) {
  console.error("❌ BOT_TOKEN não definido.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID não definido.");
  process.exit(1);
}

if (!GUILD_ID) {
  console.error("❌ GUILD_ID não definido.");
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Erro no login:", err);
});