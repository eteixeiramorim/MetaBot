// --- Fix para Render: servidor HTTP mínimo ---
const http = require("http");
http.createServer((req, res) => res.end("Bot ativo")).listen(process.env.PORT || 3000);

console.log("index.js carregado — Render está a correr!");

// Discord.js imports
const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionsBitField
} = require("discord.js");

const schedule = require("node-schedule");

// Criar client com intents necessárias
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// IDs do servidor
const ROLE_TRIGGER = "1423052122936573992"; // Império Oculto
const ROLE_CHEFE = "1422984664812884168";  // Chefe
const ROLE_SUBCHEFE = "1422986843074592928"; // Subchefe
const CATEGORY_META = "1431402444956369037"; // Categoria: Meta individual
const META_CHANNEL_ID = "1438929907215499488"; // Canal onde se enviam metas

// Quando o bot inicia
client.on("ready", () => {
    console.log(`Bot online como ${client.user.tag}`);
});


// ===============================================================
// Criar canal automático quando o user recebe o cargo Império Oculto
// ===============================================================

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
        const ganhouCargo =
            !oldMember.roles.cache.has(ROLE_TRIGGER) &&
            newMember.roles.cache.has(ROLE_TRIGGER);

        if (!ganhouCargo) return;

        console.log("Trigger detectado: criando canal de metas.");

        const guild = newMember.guild;
        const categoria = guild.channels.cache.get(CATEGORY_META);

        if (!categoria) {
            console.log("Categoria de metas não encontrada.");
            return;
        }

        const canal = await guild.channels.create({
            name: newMember.user.username.toLowerCase(),
            type: ChannelType.GuildText,
            parent: CATEGORY_META,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: newMember.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages
                    ]
                },
                { id: ROLE_CHEFE, allow: [PermissionsBitField.Flags.ViewChannel] },
                { id: ROLE_SUBCHEFE, allow: [PermissionsBitField.Flags.ViewChannel] }
            ]
        });

        console.log(`Canal criado: ${canal.name}`);

        const mensagem = await canal.send(
            "Bem-vindo ao teu canal individual de metas.\n" +
            "A partir daqui o Chefe e Subchefe vão acompanhar o teu progresso."
        );

        await mensagem.pin();
    } catch (erro) {
        console.log("Erro ao criar canal automático:", erro);
    }
});


// ===============================================================
// Sistema de enviar metas para todos os canais individuais
// ===============================================================

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== META_CHANNEL_ID) return;

    // Apenas chefes podem enviar metas
    if (
        !message.member.roles.cache.has(ROLE_CHEFE) &&
        !message.member.roles.cache.has(ROLE_SUBCHEFE)
    ) {
        return message.reply("Apenas o Chefe ou Subchefe podem enviar metas.");
    }

    console.log("Meta nova recebida. Distribuindo...");

    const guild = message.guild;
    const categoria = guild.channels.cache.get(CATEGORY_META);

    if (!categoria) {
        console.log("Categoria de metas não encontrada.");
        return;
    }

    const texto = message.content;
    const anexos = message.attachments.map(a => a.url);

    categoria.children.cache.forEach(async (canal) => {
        if (canal.type !== ChannelType.GuildText) return;

        const membro = guild.members.cache.find(
            m => canal.name === m.user.username.toLowerCase()
        );

        const mencao = membro ? `<@${membro.id}>` : "";

        try {
            await canal.send({
                content: `Nova meta enviada.\n${mencao}\n\n${texto}`,
                files: anexos
            });

            console.log(`Meta enviada para ${canal.name}`);
        } catch (erro) {
            console.log(`Erro ao enviar meta para ${canal.name}:`, erro);
        }
    });
});


// ===============================================================
// Remover canal quando o member sai
// ===============================================================

client.on("guildMemberRemove", async (member) => {
    try {
        console.log(`O membro ${member.user.username} saiu. Removendo canal...`);

        const guild = member.guild;

        const canal = guild.channels.cache.find(
            ch => ch.parentId === CATEGORY_META &&
            ch.name === member.user.username.toLowerCase()
        );

        if (canal) {
            await canal.delete().catch(() => {});
            console.log("Canal removido com sucesso.");
        }
    } catch (erro) {
        console.log("Erro ao remover canal:", erro);
    }
});


// ===============================================================
// Limpeza semanal (domingo 01:00)
// ===============================================================

schedule.scheduleJob("0 1 * * 0", async () => {
    try {
        const guild = client.guilds.cache.first();
        const categoria = guild.channels.cache.get(CATEGORY_META);

        if (!categoria) return;

        categoria.children.cache.forEach(async (canal) => {
            if (canal.type === ChannelType.GuildText) {
                const mensagens = await canal.messages.fetch();
                await canal.bulkDelete(mensagens, true);
            }
        });

        console.log("Limpeza semanal concluída.");
    } catch (erro) {
        console.log("Erro na limpeza semanal:", erro);
    }
});


// ===============================================================
// LOGIN DO BOT
// ===============================================================

client.login(process.env.TOKEN);
