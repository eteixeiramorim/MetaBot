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
    PermissionsBitField 
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
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
});

// ========================
// CONFIGURAÇÕES DO SERVIDOR
// ========================

// Cargo que cria canal
const ROLE_IMPERIO = "1423052122936573992";

// Cargos com permissão total
const ROLE_CHEFE = "👑 Chefe — O Soberano Oculto";
const ROLE_SUBCHEFE = "🦍 Subchefe — O Guardião da Coroa";
const ROLE_BOT = "MetaBot";

// Categoria nova criada por ti
const CATEGORY_ID = "1438935701973368884";

// Canal onde o Chefe/Subchefe envia metas
const META_CHANNEL_ID = "1438936038050500772";


// ========================
// BOT ONLINE
// ========================
client.once("ready", () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
});


// ========================
// FUNÇÃO → CRIAR CANAL INDIVIDUAL
// ========================
async function criarCanal(member) {
    const guild = member.guild;
    const categoria = guild.channels.cache.get(CATEGORY_ID);

    if (!categoria) {
        console.log("❌ Categoria não encontrada.");
        return;
    }

    const canalName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const roleChefe = guild.roles.cache.find(r => r.name === ROLE_CHEFE);
    const roleSub = guild.roles.cache.find(r => r.name === ROLE_SUBCHEFE);
    const roleBot = guild.roles.cache.find(r => r.name === ROLE_BOT);

    if (!roleChefe || !roleSub || !roleBot) {
        console.log("❌ ERRO: Não encontrei os cargos (Chefe/Sub/Bot).");
        return;
    }

    // Criar canal
    const canal = await guild.channels.create({
        name: canalName,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
            {
                id: guild.id, // todos
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: member.id, // dono do canal
                allow: [PermissionsBitField.Flags.ViewChannel],
                deny: [PermissionsBitField.Flags.SendMessages]
            },
            {
                id: roleChefe.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            },
            {
                id: roleSub.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            },
            {
                id: roleBot.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }
        ]
    });

    console.log(`📁 Canal criado: ${canal.name}`);
    return canal;
}


// ========================
// FUNÇÃO → APAGAR CANAL INDIVIDUAL
// ========================
async function apagarCanal(member) {
    const guild = member.guild;
    const canalName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const canal = guild.channels.cache.find(
        c => c.parentId === CATEGORY_ID && c.name === canalName
    );

    if (!canal) return;

    try {
        await canal.delete();
        console.log(`🗑️ Canal removido: ${canal.name}`);
    } catch (err) {
        console.log("❌ Erro ao remover canal:", err);
    }
}


// ========================
// EVENTO → CARGO ADICIONADO / REMOVIDO
// ========================
client.on("guildMemberUpdate", async (oldMember, newMember) => {

    const tinha = oldMember.roles.cache.has(ROLE_IMPERIO);
    const tem = newMember.roles.cache.has(ROLE_IMPERIO);

    // Ganhou cargo → criar canal
    if (!tinha && tem) {
        console.log(`📌 ${newMember.user.username} recebeu cargo Império.`);
        await criarCanal(newMember);
    }

    // Perdeu cargo → apagar canal
    if (tinha && !tem) {
        console.log(`📌 ${newMember.user.username} perdeu cargo Império.`);
        await apagarCanal(newMember);
    }
});


// ========================
// EVENTO → USER SAI DO SERVIDOR
// ========================
client.on("guildMemberRemove", async (member) => {
    console.log(`🚪 ${member.user.username} saiu do servidor.`);
    await apagarCanal(member);
});


// ========================
// EVENTO → NOVA META ENVIADA
// ========================
client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (msg.channel.id !== META_CHANNEL_ID) return;

    console.log("📩 Meta recebida, distribuindo…");

    const guild = msg.guild;

    const canais = guild.channels.cache.filter(
        c => c.parentId === CATEGORY_ID && c.type === 0
    );

    for (const canal of canais.values()) {
        try {
            await canal.send({
                content: "📌 **Nova meta adicionada!**\n\n" + msg.content,
                files: msg.attachments.map(a => a.url)
            });

            console.log(`➡️ Meta enviada para ${canal.name}`);
        } catch (err) {
            console.log(`❌ Erro no canal ${canal.name}:`, err);
        }
    }

    await msg.channel.send("✔️ Meta enviada para todos os canais individuais!");
});


// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
