const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, getContentType } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

// TEMPELKAN URL GOOGLE APPS SCRIPT ANDA DI BAWAH INI
const GOOGLE_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyigk_-GE0_BvGLD9D4pDGM1-J7ylLWDi4HT-v1seKvlFpv9ZDgEf71xaIMO7l253cclQ/exec";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n--- SCAN QR CODE INI DENGAN WHATSAPP HP ANDA ---');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('\n[BERHASIL] WhatsApp Engine Aktif di Cloud Render!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg.message || msg.key.fromMe) continue;

                const remoteJid = msg.key.remoteJid;
                if (!remoteJid.endsWith('@g.us')) continue;

                const messageType = getContentType(msg.message);
                const msgData = msg.message[messageType];
                const text = msg.message.conversation || msgData?.text || msgData?.caption || '';
                const contextInfo = msgData?.contextInfo || {};
                const mentionedJid = contextInfo.mentionedJid || [];

                const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const isMentioned = mentionedJid.includes(myJid) || text.includes(`@${sock.user.id.split(':')[0]}`);

                if (isMentioned) {
                    const groupMetadata = await sock.groupMetadata(remoteJid);
                    
                    const payload = {
                        message_id: msg.key.id,
                        group_id: remoteJid,
                        group_name: groupMetadata.subject,
                        sender_name: msg.pushName || 'Anggota Grup',
                        sender_jid: msg.key.participant || remoteJid,
                        mention_text: text,
                        mention_time: new Date().toLocaleString("id-ID")
                    };

                    console.log(`[MENTION MASUK] Dari ${payload.sender_name} di grup ${payload.group_name}`);

                    await fetch(GOOGLE_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
            } catch (err) {
                console.error('[ERROR]', err.message);
            }
        }
    });
}

connectToWhatsApp();
