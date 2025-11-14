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
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// IDs necessárias
const ROLE_TRIGGER = "1423052122936573992"; // Império Oculto
const ROLE_CHEFE = "1422984664812884168";   // Chefe
const ROLE_SUBCHEFE = "1422986843074592928"; // Subchefe
const CATEGORY_META = "1431402444956369037"; // Categoria Meta Individual
const META_CHANNEL_ID = "1438929907215499488"; // Canal de metas do chefe

// Quando o bot liga
client.on("ready", () => {
    console.log(`🟢 Bot online como ${client.user.tag}`);
});

// Detectar mudança de cargos
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
        console.log("⚠️ EVENTO DISPARADO: guildMemberUpdate");
        console.log("ANTES:", oldMember.roles.cache.map(r => r.id));
        console.log("DEPOIS:", newMember.roles.cache.map(r => r.id));

        // Se o user ganhou o cargo
        if (
            !oldMember.roles.cache.has(ROLE_TRIGGER) &&
            newMember.roles.cache.has(ROLE_TRIGGER)
        ) {
            console.log("📌 Cargo Império Oculto DETETADO! Criando canal...");

            const guild = newMember.guild;
            const categoria = guild.channels.cache.get(CATEGORY_META);

            if (!categoria) {
                console.log("❌ Categoria não encon
