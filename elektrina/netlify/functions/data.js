const PRICE_API = 'https://spotovaelektrina.cz/api/v1/price/get-prices-json-qh';

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};

    // Pravidla z query parametrů (uložená v appce)
    const rules = {
      sellAbove:    parseFloat(q.sell_above    ?? 2500),
      sellSetpoint: parseInt(q.sell_setpoint   ?? -5000),
      minSell:      parseFloat(q.min_sell      ?? 500),
      buyBelow:     parseFloat(q.buy_below     ?? 3500),
      buySOC:       parseInt(q.buy_soc         ?? 100),
      buySetpoint:  parseInt(q.buy_setpoint    ?? 5000),
      blockExport:  parseFloat(q.block_export  ?? 1000),
    };

    const resp = await fetch(PRICE_API);
    if (!resp.ok) throw new Error(`Price API HTTP ${resp.status}`);
    const data = await resp.json();
    const today = data.hoursToday || [];
    if (!today.length) throw new Error('Žádná data pro dnešek');

    const now = new Date();
    const hh  = now.getHours();
    const mm  = Math.floor(now.getMinutes() / 15) * 15;
    let idx   = today.findIndex(s => s.hour === hh && s.minute === mm);
    if (idx < 0) idx = today.length - 1;
    const spot = today[idx].priceCZK;

    // Reálná nákupní cena (D57d jednosložkový + Delta Green + poplatky + DPH)
    const DIST    = 2248;   // D57d jednosložkový
    const DG_BUY  = 350;
    const FIXED   = DIST + DG_BUY + 34.24 + 206.81 + 15.75 + 598.95;
    const buyPrice = Math.round((spot + FIXED) * 1.21);

    // Rozhodovací logika podle pravidel
    let grid_setpoint, block_export, setup_SOC, decision;

    if (spot <= 0) {
      // Záporná cena — vždy nakupuj maximum
      grid_setpoint = rules.buySetpoint;
      block_export  = false;
      setup_SOC     = 100;
      decision      = 'SUPERNAKUP';
    } else if (spot > rules.sellAbove && spot >= rules.minSell) {
      // Prodej do sítě
      grid_setpoint = rules.sellSetpoint;
      block_export  = false;
      setup_SOC     = 10;
      decision      = 'PRODEJ';
    } else if (buyPrice < rules.buyBelow) {
      // Nákup ze sítě
      grid_setpoint = rules.buySetpoint;
      block_export  = false;
      setup_SOC     = rules.buySOC;
      decision      = 'NAKUP';
    } else if (spot < rules.blockExport) {
      // Blokace přetoků
      grid_setpoint = -50;
      block_export  = true;
      setup_SOC     = 50;
      decision      = 'BLOKACE';
    } else {
      // Standby
      grid_setpoint = 0;
      block_export  = spot < rules.sellAbove;
      setup_SOC     = 50;
      decision      = 'STANDBY';
    }

    const pad = n => String(n).padStart(2,'0');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        timestamp:     now.toISOString(),
        time_slot:     `${pad(hh)}:${pad(mm)}`,
        spot_czk:      spot,
        buy_price_czk: buyPrice,
        sell_price_czk: Math.round(spot - 450),
        grid_setpoint,
        block_export,
        setup_SOC,
        decision,
        source:        'auto'
      }, null, 2)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message, timestamp: new Date().toISOString() })
    };
  }
};
