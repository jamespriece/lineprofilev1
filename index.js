
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const imageHash = require('image-hash');
const app = express();
const port = process.env.PORT || 3000;
const config = require('./config.json');

app.get('/', (req, res) => {
  res.send('✅ LINE OA Monitor with pHash and multi-account support is Running');
});

app.get('/check', async (req, res) => {
  console.log(`[HTTP] เรียกตรวจสอบจาก /check`);
  await checkAllAccounts();
  res.send('✅ ตรวจสอบแล้ว (ทุกบัญชี)');
});

app.listen(port, () => {
  console.log(`✅ Web server started on port ${port}`);
});

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

function hashImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    imageHash.hash(url, 16, 'hex', (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

function hammingDistance(hash1, hash2) {
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

function saveExpectedPicture(accountName, pictureUrl) {
  const filename = `expectedPicture_${accountName}.json`;
  const data = {
    pictureUrl: pictureUrl,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`📸 เซฟรูป expected สำหรับ ${accountName} แล้ว`);
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
      console.log(`
🔄 ตรวจสอบบัญชี: ${account.name}`);
      const current = await getLineBotInfo(account.channelAccessToken);
      let changes = [];

      let expectedPictureUrl;
      const expectedFile = `expectedPicture_${account.name}.json`;

      if (fs.existsSync(expectedFile)) {
        const expectedData = JSON.parse(fs.readFileSync(expectedFile));
        expectedPictureUrl = expectedData.pictureUrl;
      } else {
        // Save expected picture automatically
        saveExpectedPicture(account.name, current.pictureUrl);
        expectedPictureUrl = current.pictureUrl;
        changes.push(`📸 เซฟรูป expected อัตโนมัติ`);
      }

      // Compare pHash
      const expectedHash = await hashImageFromUrl(expectedPictureUrl);
      const currentHash = await hashImageFromUrl(current.pictureUrl);
      const distance = hammingDistance(expectedHash, currentHash);
      const similarity = ((1 - distance / (expectedHash.length * 4)) * 100).toFixed(2);

      if (similarity < 95) {
        changes.push(`❌ รูปเปลี่ยน (ความเหมือน ${similarity}%)`);
      } else {
        changes.push(`✅ รูปเหมือนกัน (ความเหมือน ${similarity}%)`);
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
