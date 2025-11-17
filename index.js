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
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
});

// ========================
// CONFIG DO SERVIDOR
// ========================

// Cargo que cria canal individual
const ROLE_IMPERIO_ID = "1423052122936573992";

// Cargos por NOME (no servidor)
const ROLE_CHEFE_NAME = "👑 Chefe — O Soberano Oculto";
const ROLE_SUBCHEFE_NAME = "🦍 Subchefe — O Guardião da Coroa";
const ROLE_BOT_NAME = "MetaBot";

// Cargos por ID (para lógica de prioridade nas reações)
const ROLE_CHEFE_ID = "1422984664812884168";
const ROLE_SUBCHEFE_ID = "1422986843074592928";

// Categoria das metas individuais
const CATEGORY_ID = "1438935701973368884"; // 🎯 Meta Individual

// Canal de metas
const META_CHANNEL_ID = "1438936038050500772"; // meta

// Canal de registos de membros dentro da categoria
const MEMBERS_LOG_CHANNEL_NAME = "membros";

// Canal de logs semanais
const WEEKLY_LOG_CHANNEL_NAME = "logs-meta";

// ========================
// FUNÇÕES AUXILIARES GERAIS
// ========================

function normalizarNome(nome) {
  return (
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "canal"
  );
}

function formatarData(d) {
  return d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}

// semana ISO aproximada
function obterSemana(d) {
  const data = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaNum = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaNum);
  const ano = data.getUTCFullYear();
  const inicioAno = new Date(Date.UTC(ano, 0, 1));
  const numeroSemana = Math.ceil(((data - inicioAno) / 86400000 + 1) / 7);
  return numeroSemana;
}

function intervaloSemana(d) {
  const numeroSemana = obterSemana(d);
  const dia = d.getDay(); // 0 dom, 1 seg...
  const distanciaSegunda = dia === 0 ? 6 : dia - 1;
  const segunda = new Date(d);
  segunda.setDate(d.getDate() - distanciaSegunda);
  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);
  return {
    numeroSemana,
    inicio: formatarData(segunda).split(",")[0],
    fim: formatarData(domingo).split(",")[0],
  };
}

// ========================
// CANAL "membros" (registo por utilizador)
// ========================

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
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
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

async function findMemberLogMessage(logChannel, memberId) {
  const mensagens = await logChannel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return null;
  return mensagens.find((m) => m.content.includes(`ID: ${memberId}`));
}

// Criar/atualizar registo base quando recebe cargo
async function logRegistoInicial(member, canalNome) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const existente = await findMemberLogMessage(logChannel, member.id);
  const agora = new Date();

  const conteudo =
    `🟢 Registo de ${member}\n` +
    `• ID: ${member.id}\n` +
    `• Nome global: ${member.user.username}\n` +
    `• Nome no servidor: ${member.displayName}\n` +
    `• Canal: ${canalNome}\n` +
    `• Recebeu cargo: ${formatarData(agora)}\n` +
    `• Última meta: Nenhuma ainda`;

  if (existente) {
    await existente.edit(conteudo);
  } else {
    await logChannel.send(conteudo);
  }
}

// Atualizar linha da última meta (grupo/individual)
async function logAtualizarMeta(member, tipo) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const msg = await findMemberLogMessage(logChannel, member.id);
  if (!msg) return;

  const linhas = msg.content.split("\n");
  const agora = formatarData(new Date());

  const novasLinhas = linhas.map((linha) => {
    if (linha.startsWith("• Última meta:")) {
      return `• Última meta: ${agora} (${tipo})`;
    }
    return linha;
  });

  await msg.edit(novasLinhas.join("\n"));
}

// Atualizar nomes no registo quando o user muda nome
async function logAtualizarNome(oldMember, newMember, canalNome) {
  const guild = newMember.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const msg = await findMemberLogMessage(logChannel, newMember.id);
  if (!msg) return;

  const linhas = msg.content.split("\n");
  const novas = linhas.map((linha) => {
    if (linha.startsWith("🟢 Registo de") || linha.startsWith("🚫 Saída de")) {
      const prefixo = linha.startsWith("🟢") ? "🟢 Registo de" : "🚫 Saída de";
      return `${prefixo} ${newMember}`;
    }
    if (linha.startsWith("• Nome global:")) {
      return `• Nome global: ${newMember.user.username}`;
    }
    if (linha.startsWith("• Nome no servidor:")) {
      return `• Nome no servidor: ${newMember.displayName}`;
    }
    if (linha.startsWith("• Canal:")) {
      return `• Canal: ${canalNome}`;
    }
    return linha;
  });

  await msg.edit(novas.join("\n"));
}

// Quando perde cargo ou sai do servidor — registo minimalista
async function logRemocao(member, canalNome) {
  const guild = member.guild;
  const logChannel = await getOrCreateMembersLogChannel(guild);
  if (!logChannel) return;

  const msg = await findMemberLogMessage(logChannel, member.id);
  const agora = formatarData(new Date());

  const conteudo =
    `🚫 Saída de ${member}\n` +
    `• ID: ${member.id}\n` +
    `• Nome global: ${member.user.username}\n` +
    `• Nome no servidor: ${member.displayName}\n` +
    `• Canal: ${canalNome}\n` +
    `• Removido a: ${agora}`;

  if (msg) {
    await msg.edit(conteudo);
  } else {
    await logChannel.send(conteudo);
  }
}

// ========================
// CANAL DE LOGS SEMANAIS "logs-meta"
// ========================

async function getOrCreateWeeklyLogChannel(guild) {
  const categoria = guild.channels.cache.get(CATEGORY_ID);
  if (!categoria) {
    console.log("❌ Categoria não encontrada para logs semanais.");
    return null;
  }

  let canal = guild.channels.cache.find(
    (c) =>
      c.parentId === CATEGORY_ID &&
      c.name === WEEKLY_LOG_CHANNEL_NAME &&
      c.type === ChannelType.GuildText
  );

  const roleChefe = guild.roles.cache.find((r) => r.name === ROLE_CHEFE_NAME);
  const roleSub = guild.roles.cache.find((r) => r.name === ROLE_SUBCHEFE_NAME);
  const roleBot = guild.roles.cache.find((r) => r.name === ROLE_BOT_NAME);

  if (!roleChefe || !roleSub || !roleBot) {
    console.log("❌ Não encontrei Chefe/Subchefe/MetaBot para logs semanais.");
    return null;
  }

  if (!canal) {
    canal = await guild.channels.create({
      name: WEEKLY_LOG_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
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
    console.log("📊 Canal 'logs-meta' criado.");
  }

  return canal;
}

// Obter ou criar mensagem da semana (uma por semana)
async function getOrCreateWeeklyMessage(guild) {
  const weeklyChannel = await getOrCreateWeeklyLogChannel(guild);
  if (!weeklyChannel) return null;

  const hoje = new Date();
  const info = intervaloSemana(hoje);
  const cabecalho = `📅 Semana ${info.numeroSemana} — ${info.inicio} → ${info.fim}`;

  const mensagens = await weeklyChannel.messages.fetch({ limit: 50 }).catch(() => null);
  if (mensagens) {
    const existente = mensagens.find((m) => m.content.startsWith(cabecalho));
    if (existente) return existente;
  }

  const base =
    `${cabecalho}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Usuário         Resultado         Avaliado por\n` +
    `────────────── ──────────────── ───────────────`;
  const msg = await weeklyChannel.send(base);
  return msg;
}

// Adicionar/atualizar linha na tabela semanal
async function adicionarResultadoSemana(guild, member, evaluatorDisplayName, cumpriu) {
  const weeklyMsg = await getOrCreateWeeklyMessage(guild);
  if (!weeklyMsg) return;

  let conteudo = weeklyMsg.content;
  const linhas = conteudo.split("\n");

  const nomeCanal = normalizarNome(member.displayName || member.user.username);

  const headerIndex = linhas.findIndex((l) =>
    l.startsWith("Usuário") || l.startsWith("Usuario")
  );

  const novaLinha = `${nomeCanal.padEnd(14, " ")} ${
    (cumpriu ? "🟢 Entregou".padEnd(19, " ") : "🔴 Não entregou".padEnd(19, " "))
  } ${evaluatorDisplayName}`;

  let idxUser = -1;
  for (let i = headerIndex + 2; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha.trim().length === 0) continue;
    if (linha.startsWith(nomeCanal)) {
      idxUser = i;
      break;
    }
  }

  if (idxUser === -1) {
    linhas.push(novaLinha);
  } else {
    linhas[idxUser] = novaLinha;
  }

  await weeklyMsg.edit(linhas.join("\n"));
}

// Remover linha da tabela semanal (se não houver mais reações)
async function removerResultadoSemana(guild, member) {
  const weeklyMsg = await getOrCreateWeeklyMessage(guild);
  if (!weeklyMsg) return;

  let conteudo = weeklyMsg.content;
  const linhas = conteudo.split("\n");

  const nomeCanal = normalizarNome(member.displayName || member.user.username);

  const headerIndex = linhas.findIndex((l) =>
    l.startsWith("Usuário") || l.startsWith("Usuario")
  );

  let idxUser = -1;
  for (let i = headerIndex + 2; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha.trim().length === 0) continue;
    if (linha.startsWith(nomeCanal)) {
      idxUser = i;
      break;
    }
  }

  if (idxUser === -1) return;

  linhas.splice(idxUser, 1);
  await weeklyMsg.edit(linhas.join("\n"));
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

  let existente = guild.channels.cache.find(
    (c) => c.parentId === CATEGORY_ID && c.name === canalName
  );
  if (existente) {
    console.log(`ℹ️ Canal já existia: ${canalName}`);
    await logRegistoInicial(member, existente.name);
    return existente;
  }

  const canal = await guild.channels.create({
    name: canalName,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
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

  if (canal) {
    try {
      await canal.delete();
      console.log(`🗑️ Canal removido: ${canal.name}`);
    } catch (err) {
      console.log("❌ Erro ao remover canal:", err);
    }
  }

  await logRemocao(member, canalName);
  await removerResultadoSemana(member.guild, member);
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

  if (!canal) {
    await logAtualizarNome(oldMember, newMember, newName);
    return;
  }

  try {
    await canal.setName(newName);
    console.log(`🔄 Canal renomeado: ${oldName} → ${newName}`);
    await logAtualizarNome(oldMember, newMember, newName);
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

  if (!oldHas && newHas) {
    console.log(`📌 ${newMember.user.username} recebeu cargo Império.`);
    await criarCanal(newMember);
  }

  if (oldHas && !newHas) {
    console.log(`📌 ${newMember.user.username} perdeu cargo Império.`);
    await apagarCanal(newMember);
  }

  await renomearCanalPorNome(oldMember, newMember);
});

client.on("guildMemberRemove", async (member) => {
  console.log(`🚪 ${member.user.username} saiu do servidor.`);
  await apagarCanal(member);
});

// ========================
// LIMPAR MENSAGENS (META + INDIVIDUAIS, EXCETO 'membros' e 'logs-meta')
// ========================
async function limparMensagens(guild) {
  console.log("🧹 A limpar todas as metas...");

  const metaChannel = guild.channels.cache.get(META_CHANNEL_ID);
  if (metaChannel) {
    const msgs = await metaChannel.messages.fetch({ limit: 100 }).catch(() => null);
    if (msgs) await metaChannel.bulkDelete(msgs).catch(() => {});
    console.log("✔️ Canal META limpo");
  }

  const canais = guild.channels.cache.filter(
    (c) =>
      c.parentId === CATEGORY_ID &&
      c.type === ChannelType.GuildText &&
      c.name !== MEMBERS_LOG_CHANNEL_NAME &&
      c.name !== WEEKLY_LOG_CHANNEL_NAME
  );

  for (const canal of canais.values()) {
    try {
      const msgs = await canal.messages.fetch({ limit: 100 }).catch(() => null);
      if (msgs) await canal.bulkDelete(msgs).catch(() => {});
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
    const dia = agora.getUTCDay(); // 0 = domingo
    const hora = agora.getUTCHours();
    const minuto = agora.getUTCMinutes();

    if (dia === 0 && hora === 1 && minuto === 0) {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      console.log("🕐 Execução automática da limpeza semanal...");
      await limparMensagens(guild);
      await getOrCreateWeeklyMessage(guild);
      console.log("🧹 Limpeza semanal concluída!");
    }
  }, 60 * 1000);
}

// ========================
// EVENTO DE MENSAGENS (META, !limpar, !meta @user)
// ========================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== META_CHANNEL_ID) return;

  const guild = msg.guild;
  const member = msg.member;
  if (!guild || !member) return;

  const temChefe = member.roles.cache.has(ROLE_CHEFE_ID);
  const temSub = member.roles.cache.has(ROLE_SUBCHEFE_ID);

  // !limpar
  if (msg.content.toLowerCase() === "!limpar") {
    if (!temChefe && !temSub) {
      msg.reply("❌ Não tens permissão para usar este comando.");
      return;
    }

    await limparMensagens(guild);
    msg.channel.send("🧹 Todas as metas foram apagadas com sucesso!");
    return;
  }

  // !meta @user texto
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
      canal = await criarCanal(target);
    }

    try {
      await canal.send({
        content: "📌 **Nova meta adicionada!**\n\n" + textoMeta,
        files: msg.attachments.map((a) => a.url),
      });

      console.log(`🎯 Meta individual enviada para ${canal.name}`);
      await logAtualizarMeta(target, "individual");
      msg.channel.send(`✔️ Meta individual enviada para ${target}.`);
    } catch (err) {
      console.log("❌ Erro ao enviar meta individual:", err);
      msg.channel.send("❌ Não consegui enviar a meta individual.");
    }

    return;
  }

  // Meta global
  if (!temChefe && !temSub) {
    msg.reply("❌ Apenas o Chefe ou Subchefe podem enviar metas.");
    return;
  }

  console.log("📩 Meta global recebida, distribuindo…");

  const canais = guild.channels.cache.filter(
    (c) =>
      c.parentId === CATEGORY_ID &&
      c.type === ChannelType.GuildText &&
      c.name !== MEMBERS_LOG_CHANNEL_NAME &&
      c.name !== WEEKLY_LOG_CHANNEL_NAME
  );

  for (const canal of canais.values()) {
    try {
      await canal.send({
        content: "📌 **Nova meta adicionada!**\n\n" + (msg.content || ""),
        files: msg.attachments.map((a) => a.url),
      });

      console.log(`➡️ Meta enviada para ${canal.name}`);

      const membro = guild.members.cache.find((m) => {
        const nomeNorm = normalizarNome(m.displayName || m.user.username);
        return nomeNorm === canal.name;
      });

      if (membro) {
        await logAtualizarMeta(membro, "grupo");
      }
    } catch (err) {
      console.log(`❌ Erro no canal ${canal.name}:`, err);
    }
  }

  await msg.channel.send("✔️ Meta enviada para todos os canais individuais!");
});

// ========================
// PROCESSAMENTO DE REAÇÕES (Chefe prioriza, Subchefe se único, remoção zera linha)
// ========================

async function processarReacoesMeta(msg) {
  const guild = msg.guild;
  if (!guild) return;

  if (
    msg.channel.parentId !== CATEGORY_ID ||
    [MEMBERS_LOG_CHANNEL_NAME, WEEKLY_LOG_CHANNEL_NAME].includes(msg.channel.name)
  ) {
    return;
  }

  const canalName = msg.channel.name;
  const membro = guild.members.cache.find((m) => {
    const nomeNorm = normalizarNome(m.displayName || m.user.username);
    return nomeNorm === canalName;
  });
  if (!membro) return;

  const reactionCheck = msg.reactions.cache.get("✅");
  const reactionCross = msg.reactions.cache.get("❌");

  let chefeMember = null;
  let chefeCumpriu = null;
  let subMember = null;
  let subCumpriu = null;

  async function analisarReaction(reaction, cumpriuValor) {
    if (!reaction) return;
    const users = await reaction.users.fetch().catch(() => null);
    if (!users) return;
    for (const [uid, user] of users) {
      if (user.bot) continue;
      const m =
        guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
      if (!m) continue;
      if (m.roles.cache.has(ROLE_CHEFE_ID)) {
        chefeMember = m;
        chefeCumpriu = cumpriuValor;
      } else if (m.roles.cache.has(ROLE_SUBCHEFE_ID)) {
        subMember = m;
        subCumpriu = cumpriuValor;
      }
    }
  }

  await analisarReaction(reactionCheck, true);
  await analisarReaction(reactionCross, false);

  if (chefeMember) {
    await adicionarResultadoSemana(guild, membro, chefeMember.displayName, chefeCumpriu);
  } else if (subMember) {
    await adicionarResultadoSemana(guild, membro, subMember.displayName, subCumpriu);
  } else {
    await removerResultadoSemana(guild, membro);
  }
}

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});

    const msg = reaction.message;
    const emoji = reaction.emoji.name;
    if (emoji !== "✅" && emoji !== "❌") return;

    await processarReacoesMeta(msg);
  } catch (err) {
    console.log("❌ Erro ao processar reação adicionada:", err);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});

    const msg = reaction.message;
    const emoji = reaction.emoji.name;
    if (emoji !== "✅" && emoji !== "❌") return;

    await processarReacoesMeta(msg);
  } catch (err) {
    console.log("❌ Erro ao processar reação removida:", err);
  }
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
