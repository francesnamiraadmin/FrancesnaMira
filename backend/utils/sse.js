// Registro simples de clientes conectados via Server-Sent Events, em memória.
// Suficiente para um único processo Node; se o site crescer para múltiplas
// instâncias, isso precisaria virar um pub/sub externo (ex.: Redis).
const clientes = new Set();
// Limites de conexões abertas — o stream é público e cada conexão fica viva
// indefinidamente, então sem teto um único cliente poderia esgotar o servidor.
const MAX_CLIENTES = 2000;
const MAX_POR_IP = 10;
const porIp = new Map();

// Retorna a função de remoção, ou null se o limite foi atingido.
function registrarCliente(res, ip = "") {
  const doIp = porIp.get(ip) || 0;
  if (clientes.size >= MAX_CLIENTES || doIp >= MAX_POR_IP) return null;
  clientes.add(res);
  porIp.set(ip, doIp + 1);
  return () => {
    if (!clientes.delete(res)) return;
    const restante = (porIp.get(ip) || 1) - 1;
    if (restante <= 0) porIp.delete(ip); else porIp.set(ip, restante);
  };
}

function transmitir(evento, dados) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const res of clientes) {
    res.write(payload);
  }
}

module.exports = { registrarCliente, transmitir };
