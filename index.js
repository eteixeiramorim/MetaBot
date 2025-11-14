// ----------------------
// FIX PARA O RENDER (HTTP SERVER KEEP-ALIVE)
// ----------------------
const http = require("http");
http.createServer((req, res) => res.end("Bot ativo")).listen(process.env.PORT || 3000);

// ----------------------
// DISCORD BOT CONFIG
// ----------------------
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require("discord.js");
require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// ----------------------
// IDs DEFINIDOS POR TI
// ----------------------
const ROLE_IMPERIO = "1423052122936573992"; // Cargo que cria canal
const ROLE_CHEFE = "1422984664812884168";  // Chefe
const ROLE_SUBCHEFE = "1422986843074592928"; // Subchefe

const CATEGORY_ID = "1438935701973368884"; // 🎯 Meta Individual (nova)
const META_CHANNEL_ID = "1438936038050500772"; // Canal meta (novo)

// ----------------------
// BOT ONLINE
// ----------------------
client.once("ready", () => {
    console.log(`🔥 Bot online como ${client.user.tag}`);
});

// ----------------------
// FUNÇÃO → Criar canal individual
// ----------------------
async function criarCanalIndividual(member) {
    const guild = member.guild;
    const categoria = guild.channels.cache.get(CATEGORY_ID);

    if (!categoria) {
        console.log("❌ Categoria não encontrada!");
        return;
    }

    const nomeCanal = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");

    try {
        const canal = await guild.channels.create({
            name: nomeCanal,
            type: 0, // Texto
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: ROLE_CHEFE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: ROLE_SUBCHEFE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        console.log(`✅ Canal criado: ${canal.name}`);
        return canal;

    } catch (err) {
        console.log("❌ Erro ao criar canal:", err);
    }
}

// ----------------------
// FUNÇÃO → Apagar canal individual
// ----------------------
async function apagarCanal(member) {
    const guild = member.guild;
    const nomeCanal = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const canal = guild.channels.cache.find(c =>
        c.parentId === CATEGORY_ID &&
        c.name === nomeCanal
    );

    if (!canal) return;

    try {
        await canal.delete();
        console.log(`🗑️ Canal removido: ${nomeCanal}`);
    } catch (err) {
        console.log("❌ Erro ao remover canal:", err);
    }
}

// ----------------------
// QUANDO O CARGO É ADICIONADO
// ----------------------
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const tinha = oldMember.roles.cache.has(ROLE_IMPERIO);
    const tem = newMember.roles.cache.has(ROLE_IMPERIO);

    if (!tinha && tem) {
        console.log(`📌 Cargo Império atribuído a ${newMember.user.username}`);
        criarCanalIndividual(newMember);
    }

    if (tinha && !tem) {
        console.log(`📌 Cargo Império removido de ${newMember.user.username}`);
        apagarCanal(newMember);
    }
});

// ----------------------
// FUNÇÃO → Enviar meta para todos canais individuais
// ----------------------
async function enviarMetaParaTodos(guild, conteudo, anexo) {
    const canais = guild.channels.cache.filter(c => c.parentId === CATEGORY_ID && c.id !== META_CHANNEL_ID);

    for (const canal of canais.values()) {
        try {
            await canal.send({
                content: `📌 **Nova meta enviada por ${conteudo.autor}!**\n\n${conteudo.texto}`,
                files: anexo ? [anexo] : []
            });

            console.log(`➡️ Meta enviada para: ${canal.name}`);
        } catch (err) {
            console.log(`❌ Erro no canal ${canal.name}:`, err.message);
        }
    }
}

// ----------------------
// DETEÇÃO DE NOVA META
// ----------------------
client.on("messageCreate", async (msg) => {
    if (msg.channel.id !== META_CHANNEL_ID) return;
    if (msg.author.bot) return;

    const conteudo = {
        autor: msg.author.username,
        texto: msg.content || ""
    };

    const anexo = msg.attachments.first() ? msg.attachments.first().url : null;

    console.log("📨 Nova meta capturada, enviando para todos os canais...");

    await enviarMetaParaTodos(msg.guild, conteudo, anexo);

    await msg.channel.send("✅ Meta enviada para todos os canais individuais.");
});

// ----------------------
// LOGIN DO BOT
// ----------------------
client.login(process.env.TOKEN);
