const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const config = require('./config.json');

// Simple home route to keep Render awake
app.get('/', (req, res) => {
  res.send('✅ LINE OA Monitor Web Server is Running');
});

app.listen(port, () => {
  console.log(`✅ Web server started on port ${port}`);
});

app.get('/check', async (req, res) => {
  console.log(`[HTTP] เรียกตรวจสอบจาก /check`);
  await checkAllAccounts();
  res.send('✅ ตรวจสอบแล้ว');
});

// Load previous profile
function loadPreviousProfile(accountName) {
  const filename = `lastProfile_${accountName}.json`;
  if (!fs.existsSync(filename)) return {};
  const raw = fs.readFileSync(filename);
  return JSON.parse(raw);
}

// Save current profile
function saveProfile(accountName, profile) {
  const filename = `lastProfile_${accountName}.json`;
  fs.writeFileSync(filename, JSON.stringify(profile, null, 2));
}

// Get Line profile info
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

// Send Telegram message
async function sendTelegram(botToken, chatId, message) {
  await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId,
    text: message
  });
}

// Check accounts
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
        console.log(`✅ ไม่มีการเปลี่ยนแปลง: ${account.name}`);
      }
    } catch (err) {
      console.error(`❌ [${account.name}] เกิดข้อผิดพลาด:`, err.response?.data || err.message);
    }
  }
}

// Run check every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log('🔁 ตรวจสอบ LINE OA ทุก 10 นาที...');
  checkAllAccounts();
});

// Run immediately on start
checkAllAccounts();
