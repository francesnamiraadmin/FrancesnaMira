// Canais privados de Server-Sent Events (diferente de utils/sse.js, que é um broadcast
// público). Cada conexão entra num canal nomeado — ex.: "simulado:<id>" (aluno + professor
// daquela tentativa) ou "simulados:equipe" (painel ao vivo da equipe). Em memória: vale para
// um único processo Node, como o resto do tempo real do site.
const canais = new Map();
const MAX_POR_CANAL = 20;

function abrir(req, res, canal) {
  const set = canais.get(canal) || new Set();
  if (set.size >= MAX_POR_CANAL) return res.status(429).json({ msg: "Conexões demais neste canal." });
  set.add(res);
  canais.set(canal, set);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(": ok\n\n");
  // Comentário periódico mantém a conexão viva atrás de proxies (Railway corta ociosas).
  const pulso = setInterval(() => res.write(": pulso\n\n"), 25000);
  req.on("close", () => {
    clearInterval(pulso);
    set.delete(res);
    if (!set.size) canais.delete(canal);
  });
}

function enviar(canal, evento, dados) {
  const set = canais.get(canal);
  if (!set) return;
  const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const res of set) res.write(payload);
}

const conectados = canal => canais.get(canal)?.size || 0;

module.exports = { abrir, enviar, conectados };
