// --- Fix para Render: servidor HTTP mínimo ---
const http = require("http");
http.createServer((req, res) => res.end("Bot ativo")).listen(process.env.PORT || 3000);

console.log("📌 index.js carregado — Render está a correr!");

// Discord.js imports
const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionsBitField,
} = require("discord.js");
const schedule = require("node-schedule");

// Criar client com intents necessárias
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

// IDs necessárias
const ROLE_TRIGGER = "1423052122936573992"; // Império Oculto 🕵
const ROLE_CHEFE = "1422984664812884168";   // 👑 Chefe
const ROLE_SUBCHEFE = "1422986843074592928"; // 🦍 Subchefe
const CATEGORY_META = "1431402444956369037"; // 🎯 Meta individual

// Quando o bot liga
client.on("ready", () => {
    console.log(`🟢 Bot online como ${client.user.tag}`);
});

// DEBUG — ver mudanças de cargo
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    console.log("⚠️ EVENTO DISPARADO: guildMemberUpdate");
    console.log("ANTES:", oldMember.roles.cache.map(r => r.id));
    console.log("DEPOIS:", newMember.roles.cache.map(r => r.id));

    // Se o user ganhou o cargo Império Oculto
    if (
        !oldMember.roles.cache.has(ROLE_TRIGGER) &&
        newMember.roles.cache.has(ROLE_TRIGGER)
    ) {
        console.log("📌 Cargo Império Oculto DETETADO! Criando canal...");

        const guild = newMember.guild;
        const categoria = guild.channels.cache.get(CATEGORY_META);

        if (!categoria) {
            console.log("❌ Categoria não encontrada!");
            return;
        }

        // Criar canal
        const canal = await guild.channels.create({
            name: newMember.user.username.toLowerCase(),
            type: ChannelType.GuildText,
            parent: CATEGORY_META,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: newMember.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                    ],
                },
                {
                    id: ROLE_CHEFE,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: ROLE_SUBCHEFE,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
            ],
        });

        console.log(`✅ Canal criado: ${canal.name}`);

        // Mensagem fixa
        const mensagem = await canal.send(
`⚔️ **Bem-vindo ao teu canal de metas, ${newMember.user.username}!**

Aqui irás gerir a tua evolução semanal.  
O **Chefe** e o **Subchefe** irão acompanhar-te de perto.

Qualquer dúvida, chama.`
        );

        await mensagem.pin();
        console.log("📌 Mensagem fixa enviada e marcada.");
    }
});

// Remover canal quando o membro sai
client.on("guildMemberRemove", async (member) => {
    console.log(`⚠️ ${member.user.username} saiu — verificando canal...`);

    const guild = member.guild;
    const canal = guild.channels.cache.find(
        (ch) =>
            ch.parentId === CATEGORY_META &&
            ch.name === member.user.username.toLowerCase()
    );

    if (canal) {
        await canal.delete().catch(() => {});
        console.log("🗑️ Canal apagado.");
    }
});

// Limpar mensagens todos os domingos às 01:00
schedule.scheduleJob("0 1 * * 0", async () => {
    const guild = client.guilds.cache.first();
    const categoria = guild.channels.cache.get(CATEGORY_META);

    if (!categoria) return;

    categoria.children.cache.forEach(async (canal) => {
        if (canal.type === ChannelType.GuildText) {
            const msgs = await canal.messages.fetch();
            canal.bulkDelete(msgs, true).catch(() => {});
        }
    });

    console.log("✨ Conversas limpas na categoria Meta Individual.");
});

// Login com token do Render
client.login(process.env.TOKEN);
