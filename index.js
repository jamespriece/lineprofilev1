const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const config = require('./config.json');

app.get('/', (req, res) => {
  res.send('✅ LINE OA Monitor Web Server is Running');
});

app.get('/check', async (req, res) => {
  console.log(`[HTTP] เรียกตรวจสอบจาก /check`);
  await checkAllAccounts();
  res.send('✅ ตรวจสอบแล้ว');
});

app.get('/test', async (req, res) => {
  for (const account of config.accounts) {
    const msg = `🔔 [${account.name}] ทดสอบการแจ้งเตือน Telegram สำเร็จแล้ว`;
    await sendTelegram(account.telegramBotToken, account.telegramChatId, msg);
  }
  res.send('✅ ส่งข้อความทดสอบแล้ว');
});

app.listen(port, () => {
  console.log(`✅ Web server started on port ${port}`);
});

function loadPreviousProfile(accountName) {
  const filename = `lastProfile_${accountName}.json`;
  if (!fs.existsSync(filename)) return {};
  const raw = fs.readFileSync(filename);
  return JSON.parse(raw);
}

function saveProfile(accountName, profile) {
  const filename = `lastProfile_${accountName}.json`;
  fs.writeFileSync(filename, JSON.stringify(profile, null, 2));
}

async function getLineProfile(channelAccessToken) {
  const res = await axios.get('https://api.line.me/v2/bot/info', {
    headers: {
      Authorization: `Bearer ${channelAccessToken}`
    }
  });
  return {
    displayName: res.data.displayName,
    pictureUrl: res.data.pictureUrl
  };
}

async function sendTelegram(botToken, chatId, message) {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message
    });
  } catch (err) {
    console.error("❌ Error sending Telegram message:", err.response?.data || err.message);
  }
}

async function checkAllAccounts() {
  for (const account of config.accounts) {
    try {
      const current = await getLineProfile(account.channelAccessToken);
      const previous = loadPreviousProfile(account.name);
      let changes = [];

      if (current.displayName !== previous.displayName) {
        changes.push(`🔤 ชื่อเปลี่ยนจาก "${previous.displayName || 'ไม่พบ'}" → "${current.displayName}"`);
      }

      if (current.pictureUrl !== previous.pictureUrl) {
        changes.push(`🖼️ รูปโปรไฟล์มีการเปลี่ยนแปลง`);
      }

      
      if (changes.length > 0) {
        const msg = `📢 [${account.name}] พบการเปลี่ยนแปลง:\n${changes.join('\n')}`;


        await sendTelegram(account.telegramBotToken, account.telegramChatId, msg);
        saveProfile(account.name, current);
        console.log(`✅ แจ้งเตือนแล้ว: ${account.name}`);
      } else {
        const msg = `✅ [${account.name}] ตรวจสอบแล้ว: ไม่พบการเปลี่ยนแปลง`;
        await sendTelegram(account.telegramBotToken, account.telegramChatId, msg);
        console.log(`✅ ไม่มีการเปลี่ยนแปลง: ${account.name}`);
      }
`);
      }
    } catch (err) {
      console.error(`❌ [${account.name}] เกิดข้อผิดพลาด:`, err.response?.data || err.message);
    }
  }
}
