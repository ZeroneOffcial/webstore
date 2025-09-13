// server.js
const express = require("express");
const axios = require("axios");
const qs = require("qs");
const QRCode = require("qrcode");
const fs = require("fs");
const moment = require("moment-timezone");

const app = express();
const port = 3000;

// 🟢 Konfigurasi
const ApikeyAtlantic = "mA5UO8rGDm4w7qBX2vgHjOPF9cyau1oGF49zVvAjXCL6wYbirut2GqRdCcSQNEOO5tUTLxIcyOEIDYpIc2qatQW3390F25bZJshf";
const FeeTransaksi = 10;
const activeOrders = {}; // simpan order aktif

app.use(express.json());

// 🟢 Buat transaksi order
app.post("/api/order", async (req, res) => {
  const { productName, price, userId } = req.body;
  const total = price + FeeTransaksi;
  const reff = `ORDER-${Math.floor(Math.random() * 1000000)}`;

  try {
    const depositData = qs.stringify({
      api_key: ApikeyAtlantic,
      reff_id: reff,
      nominal: total,
      type: "ewallet",
      metode: "qris"
    });

    const response = await axios.post("https://atlantich2h.com/deposit/create", depositData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (!response.data.status) {
      return res.status(400).json({ error: response.data.message || "Gagal membuat transaksi" });
    }

    const info = response.data.data;
    const qrImage = await QRCode.toDataURL(info.qr_string);

    // Simpan order aktif
    activeOrders[reff] = {
      productName,
      price,
      total,
      reff,
      id: info.id,
      status: "pending",
      userId
    };

    res.json({
      reff_id: reff,
      nominal: info.nominal,
      productName,
      price,
      qrImage,
      expired: Date.now() + 5 * 60 * 1000 // 5 menit
    });

    // Cek status otomatis
    checkPaymentStatus(reff);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Gagal memproses order" });
  }
});

// 🟢 Cek status pembayaran
async function checkPaymentStatus(reff) {
  if (!activeOrders[reff]) return;
  const order = activeOrders[reff];

  const interval = setInterval(async () => {
    try {
      const check = await axios.post(
        "https://atlantich2h.com/deposit/status",
        qs.stringify({ api_key: ApikeyAtlantic, id: order.id }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const status = check?.data?.data?.status;
      if (status && status !== "pending") {
        clearInterval(interval);
        order.status = status;

        // tandai selesai
        delete activeOrders[reff];

        // Simpan log sukses
        const waktu = moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
        const log = `[${waktu}] SUCCESS: ${reff} | ${order.productName} | Rp${order.price}\n`;
        fs.appendFileSync("./payments.log", log);

        console.log("✅ Pembayaran sukses:", order);

        // 👉 di sini kamu bisa otomatis kirim produk
        // misalnya pakai bot Telegram API / WhatsApp API
      }
    } catch (err) {
      console.error("❌ Gagal cek status:", err.message);
    }
  }, 5000); // cek tiap 5 detik
}

app.listen(port, () => console.log(`✅ Server jalan di http://localhost:${port}`));
