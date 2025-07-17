const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const config = require('./config.json');

app.get('/', (req, res) => {
  res.send('✅ LINE OA Monitor with Image Comparison is Running');
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

async function getLineBotInfo(channelAccessToken) {
  const res = await axios.get('https://api.line.me/v2/bot/info', {
    headers: {
      Authorization: `Bearer ${channelAccessToken}`
    }
  });
  return {
    displayName: res.data.displayName,
    pictureUrl: res.data.pictureUrl || null
  };
}

async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return response.data;
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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
      const current = await getLineBotInfo(account.channelAccessToken);
      const previous = loadPreviousProfile(account.name);
      let changes = [];

      // ตรวจสอบชื่อ
      if (account.expectedName && current.displayName !== account.expectedName) {
        changes.push(`❌ ชื่อไม่ตรง: ปัจจุบัน "${current.displayName}" ควรเป็น "${account.expectedName}"`);
      }

      // ตรวจสอบรูปโปรไฟล์ด้วยการดาวน์โหลดแล้วเทียบ hash
      if (account.expectedPictureUrl && current.pictureUrl) {
        try {
          const currentImg = await downloadImage(current.pictureUrl);
          const expectedImg = await downloadImage(account.expectedPictureUrl);

          const currentHash = hashBuffer(currentImg);
          const expectedHash = hashBuffer(expectedImg);

          if (currentHash !== expectedHash) {
            changes.push(`❌ รูป LINE OA ไม่ตรงกับที่กำหนด`);
          } else {
            changes.push(`✅ รูปตรงกัน (hash: ${currentHash.slice(0, 10)}...)`);
          }
        } catch (err) {
          changes.push(`⚠️ ไม่สามารถเปรียบเทียบรูปได้: ${err.message}`);
        }
      } else {
        changes.push(`⚠️ ไม่พบ URL รูปจาก LINE OA`);
      }

      if (current.displayName !== previous.displayName || current.pictureUrl !== previous.pictureUrl) {
        saveProfile(account.name, current);
      }

      const msg = `📢 [${account.name}]
${changes.join('\n')}`;
      await sendTelegram(account.telegramBotToken, account.telegramChatId, msg);
      console.log(`✅ ตรวจสอบแล้ว: ${account.name}`);
    } catch (err) {
      console.error(`❌ [${account.name}] เกิดข้อผิดพลาด:`, err.response?.data || err.message);
    }
  }
}
