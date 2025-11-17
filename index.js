// ========================
// FIX PARA RENDER (mantém o bot ativo)
// ========================
const http = require("http");
http.createServer((req, res) => res.end("Bot ativo")).listen(process.env.PORT || 3000);

// ========================
// IMPORTS
// ========================
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");
require("dotenv").config();

// ========================
// CLIENT
// ========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ========================
// CONFIG DO SERVIDOR
// ========================

// Cargo que cria canal
const ROLE_IMPERIO_ID = "1423052122936573992";

// Cargos por NOME
const ROLE_CHEFE_NAME = "👑 Chefe — O Soberano Oculto";
const ROLE_SUBCHEFE_NAME = "🦍 Subchefe — O Guardião da Coroa";
const ROLE_BOT_NAME = "MetaBot";

// Categoria das metas individuais
const CATEGORY_ID = "1438935701973368884"; // 🎯 Meta Individual

// Canal de metas
const META_CHANNEL_ID = "1438936038050500772"; // meta

// Nome do canal de registos
const MEMBERS_LOG_CHANNEL_NAME = "membros";

// ========================
// FUNÇÕES AUXILIARES
// ========================

// Normalizar nome para nome de canal
function normalizarNome(nome) {
  return (
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // tira acentos
      .replace(/[^a-z0-9]+/g, "-") // tudo o que não for letra/número vira "-"
      .replace(/^-+|-+$/g, "") || "canal"
  );
}

// Obter ou criar o canal "membros"
async function getOrCreateMembersLogChannel(guild) {
  const categoria = guild.channels.cache.get(CATEGORY_ID);
  if (!categoria) {
    console.log("❌ Categoria de metas não encontrada.");
    return null;
  }

  let canal = guild.channels.cache.find(
    (c) =>
      c.parentId === CATEGORY_ID &&
      c.name === MEMBERS_LOG_CHANNEL_NAME &&
      c.type === ChannelType.GuildText
  );

  const roleChefe = guild.roles.cache.find((r) => r.name === ROLE_CHEFE_NAME);
  const roleSub = guild.roles.cache.find((r) => r.name === ROLE_SUBCHEFE_NAME);
  const roleBot = guild.roles.cache.find((r) => r.name === ROLE_BOT_NAME);

  if (!roleChefe || !roleSub || !roleBot) {
    console.log("❌ Não encontrei Chefe/Subchefe/MetaBot por nome.");
    return null;
  }

  if (!canal) {
    canal = await guild.channels.create({
      name: MEMBERS_LOG_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: roleChefe.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        {
          id: roleSub.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        {
          id: roleBot.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
      ],
    });

    console.log("📋 Canal 'membros' criado.");
  }

  return canal;
}

// Data/hora formatada simples
function formatarData(d) {
  return d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}

// ========================
// LOGS NO CANAL "membros"
// ========================

async function logRegistoInicial(member, canalNome) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const agora = new Date();
  await logChannel.send(
    `🟢 Registo de ${member}\n` +
      `• ID: \`${member.id}\`\n` +
      `• Nome global: **${member.user.username}**\n` +
      `• Nome no servidor: **${member.displayName}**\n` +
      `• Canal: **${canalNome}**\n` +
      `• Recebeu cargo: ${formatarData(agora)}\n` +
      `• Última meta: Nenhuma ainda`
  );
}

async function logNomeAtualizado(oldMember, newMember, canalNome) {
  const guild = newMember.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const agora = new Date();
  await logChannel.send(
    `🔄 Nome atualizado para ${newMember}\n` +
      `• ID: \`${newMember.id}\`\n` +
      `• Nome global: **${newMember.user.username}**\n` +
      `• Nome anterior no servidor: **${oldMember.displayName}**\n` +
      `• Nome atual no servidor: **${newMember.displayName}**\n` +
      `• Canal atual: **${canalNome}**\n` +
      `• Atualizado em: ${formatarData(agora)}`
  );
}

async function logPerdeuCargo(member) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const agora = new Date();
  await logChannel.send(
    `🚫 ${member} perdeu o cargo Império.\n` +
      `• ID: \`${member.id}\`\n` +
      `• Nome no servidor: **${member.displayName}**\n` +
      `• Data: ${formatarData(agora)}`
  );
}

async function logSaiu(member) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const agora = new Date();
  await logChannel.send(
    `🚪 ${member.user.tag} saiu do servidor.\n` +
      `• ID: \`${member.id}\`\n` +
      `• Último nome no servidor: **${member.displayName}**\n` +
      `• Data: ${formatarData(agora)}`
  );
}

async function logMetaGlobal(author) {
  const guild = author.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const agora = new Date();
  await logChannel.send(
    `📌 Meta global enviada por ${author}\n` +
      `• Data: ${formatarData(agora)}`
  );
}

async function logMetaIndividual(member, autor) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const agora = new Date();
  await logChannel.send(
    `🎯 Meta individual enviada para ${member} por ${autor}\n` +
      `• Data: ${formatarData(agora)}`
  );
}

// ========================
// CRIAR / APAGAR / RENOMEAR CANAL INDIVIDUAL
// ========================

async function criarCanal(member) {
  const guild = member.guild;
  const categoria = guild.channels.cache.get(CATEGORY_ID);

  if (!categoria) {
    console.log("❌ Categoria não encontrada.");
    return;
  }

  const display = member.displayName || member.user.username;
  const canalName = normalizarNome(display);

  const roleChefe = guild.roles.cache.find((r) => r.name === ROLE_CHEFE_NAME);
  const roleSub = guild.roles.cache.find((r) => r.name === ROLE_SUBCHEFE_NAME);
  const roleBot = guild.roles.cache.find((r) => r.name === ROLE_BOT_NAME);

  if (!roleChefe || !roleSub || !roleBot) {
    console.log("❌ ERRO: Não encontrei Chefe/Subchefe/MetaBot por nome.");
    return;
  }

  // Evitar duplicado
  const existente = guild.channels.cache.find(
    (c) => c.parentId === CATEGORY_ID && c.name === canalName
  );
  if (existente) {
    console.log(`ℹ️ Canal já existia: ${canalName}`);
    return existente;
  }

  const canal = await guild.channels.create({
    name: canalName,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: member.id,
        allow: [PermissionsBitField.Flags.ViewChannel],
        deny: [PermissionsBitField.Flags.SendMessages],
      },
      {
        id: roleChefe.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      },
      {
        id: roleSub.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      },
      {
        id: roleBot.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      },
    ],
  });

  console.log(`📁 Canal criado: ${canal.name}`);
  await logRegistoInicial(member, canal.name);
  return canal;
}

async function apagarCanal(member) {
  const guild = member.guild;
  const display = member.displayName || member.user.username;
  const canalName = normalizarNome(display);

  const canal = guild.channels.cache.find(
    (c) => c.parentId === CATEGORY_ID && c.name === canalName
  );
  if (!canal) return;

  try {
    await canal.delete();
    console.log(`🗑️ Canal removido: ${canal.name}`);
  } catch (err) {
    console.log("❌ Erro ao remover canal:", err);
  }
}

async function renomearCanalPorNome(oldMember, newMember) {
  const guild = newMember.guild;
  const oldDisplay = oldMember.displayName || oldMember.user.username;
  const newDisplay = newMember.displayName || newMember.user.username;

  const oldName = normalizarNome(oldDisplay);
  const newName = normalizarNome(newDisplay);

  if (oldName === newName) return;

  const canal = guild.channels.cache.find(
    (c) => c.parentId === CATEGORY_ID && c.name === oldName
  );

  if (!canal) return;

  try {
    await canal.setName(newName);
    console.log(`🔄 Canal renomeado: ${oldName} → ${newName}`);
    await logNomeAtualizado(oldMember, newMember, newName);
  } catch (err) {
    console.log("❌ Erro ao renomear canal:", err);
  }
}

// ========================
// EVENTOS DE MEMBROS
// ========================

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const oldHas = oldMember.roles.cache.has(ROLE_IMPERIO_ID);
  const newHas = newMember.roles.cache.has(ROLE_IMPERIO_ID);

  // Ganhou cargo
  if (!oldHas && newHas) {
    console.log(`📌 ${newMember.user.username} recebeu cargo Império.`);
    await criarCanal(newMember);
  }

  // Perdeu cargo
  if (oldHas && !newHas) {
    console.log(`📌 ${newMember.user.username} perdeu cargo Império.`);
    await apagarCanal(newMember);
    await logPerdeuCargo(newMember);
  }

  // Mudança de nome → renomear canal
  await renomearCanalPorNome(oldMember, newMember);
});

client.on("guildMemberRemove", async (member) => {
  console.log(`🚪 ${member.user.username} saiu do servidor.`);
  await apagarCanal(member);
  await logSaiu(member);
});

// ========================
// FUNÇÃO → LIMPAR MENSAGENS (META + INDIVIDUAIS, EXCETO "membros")
// ========================
async function limparMensagens(guild) {
  console.log("🧹 A limpar todas as metas...");

  // Canal META
  const metaChannel = guild.channels.cache.get(META_CHANNEL_ID);
  if (metaChannel) {
    const msgs = await metaChannel.messages.fetch({ limit: 100 });
    await metaChannel.bulkDelete(msgs).catch(() => {});
    console.log("✔️ Canal META limpo");
  }

  // Canais individuais
  const canais = guild.channels.cache.filter(
    (c) =>
      c.parentId === CATEGORY_ID &&
      c.type === ChannelType.GuildText &&
      c.name !== MEMBERS_LOG_CHANNEL_NAME
  );

  for (const canal of canais.values()) {
    try {
      const msgs = await canal.messages.fetch({ limit: 100 });
      await canal.bulkDelete(msgs).catch(() => {});
      console.log(`✔️ Limpo: ${canal.name}`);
    } catch (err) {
      console.log(`❌ Erro ao limpar ${canal.name}:`, err);
    }
  }

  console.log("🧹✨ Limpeza de metas concluída!");
}

// ========================
// LIMPEZA AUTOMÁTICA SEMANAL (Domingo 01:00 UTC)
// ========================
function iniciarLimpezaSemanal() {
  setInterval(async () => {
    const agora = new Date();
    const dia = agora.getUTCDay(); // 0 = Domingo
    const hora = agora.getUTCHours();
    const minuto = agora.getUTCMinutes();

    if (dia === 0 && hora === 1 && minuto === 0) {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      console.log("🕐 Execução automática da limpeza semanal...");
      await limparMensagens(guild);
      console.log("🧹 Limpeza semanal concluída!");
    }
  }, 60 * 1000); // verifica a cada minuto
}

// ========================
// EVENTO PRINCIPAL DE MENSAGENS
// ========================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // Só lidamos com coisas do canal META
  if (msg.channel.id !== META_CHANNEL_ID) return;

  const guild = msg.guild;
  const member = msg.member;

  if (!guild || !member) return;

  // Checar cargos do autor
  const temChefe = member.roles.cache.some((r) => r.name === ROLE_CHEFE_NAME);
  const temSub = member.roles.cache.some((r) => r.name === ROLE_SUBCHEFE_NAME);

  // ========================
  // COMANDO !limpar
  // ========================
  if (msg.content.toLowerCase() === "!limpar") {
    if (!temChefe && !temSub) {
      msg.reply("❌ Não tens permissão para usar este comando.");
      return;
    }

    await limparMensagens(guild);
    msg.channel.send("🧹 Todas as metas foram apagadas com sucesso!");
    return;
  }

  // ========================
  // COMANDO !meta @user texto...
  // ========================
  if (msg.content.toLowerCase().startsWith("!meta")) {
    if (!temChefe && !temSub) {
      msg.reply("❌ Não tens permissão para usar este comando.");
      return;
    }

    const target = msg.mentions.members.first();
    if (!target) {
      msg.reply("⚠️ Tens de mencionar um utilizador. Ex: `!meta @user texto...`");
      return;
    }

    const argsTexto = msg.content.split(" ").slice(2).join(" ");
    const textoMeta = argsTexto || "(sem texto)";

    const display = target.displayName || target.user.username;
    const canalName = normalizarNome(display);

    let canal = guild.channels.cache.find(
      (c) => c.parentId === CATEGORY_ID && c.name === canalName
    );

    if (!canal) {
      // Se por acaso não existir, cria
      canal = await criarCanal(target);
    }

    try {
      await canal.send({
        content: "📌 **Nova meta adicionada! (Individual)**\n\n" + textoMeta,
        files: msg.attachments.map((a) => a.url),
      });

      console.log(`🎯 Meta individual enviada para ${canal.name}`);
      await logMetaIndividual(target, member);
      msg.channel.send(`✔️ Meta individual enviada para ${target}.`);
    } catch (err) {
      console.log("❌ Erro ao enviar meta individual:", err);
      msg.channel.send("❌ Não consegui enviar a meta individual.");
    }

    return;
  }

  // ========================
  // META GLOBAL (qualquer outra mensagem no canal META)
  // ========================
  if (!temChefe && !temSub) {
    msg.reply("❌ Apenas o Chefe ou Subchefe podem enviar metas.");
    return;
  }

  console.log("📩 Meta global recebida, distribuindo…");

  const canais = guild.channels.cache.filter(
    (c) =>
      c.parentId === CATEGORY_ID &&
      c.type === ChannelType.GuildText &&
      c.name !== MEMBERS_LOG_CHANNEL_NAME
  );

  for (const canal of canais.values()) {
    try {
      await canal.send({
        content: "📌 **Nova meta adicionada!**\n\n" + (msg.content || ""),
        files: msg.attachments.map((a) => a.url),
      });

      console.log(`➡️ Meta enviada para ${canal.name}`);
    } catch (err) {
      console.log(`❌ Erro no canal ${canal.name}:`, err);
    }
  }

  await logMetaGlobal(member);
  await msg.channel.send("✔️ Meta enviada para todos os canais individuais!");
});

// ========================
// BOT ONLINE
// ========================
client.once("ready", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);
  iniciarLimpezaSemanal();
});

// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
