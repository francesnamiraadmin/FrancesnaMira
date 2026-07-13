// Registro simples de clientes conectados via Server-Sent Events, em memória.
// Suficiente para um único processo Node; se o site crescer para múltiplas
// instâncias, isso precisaria virar um pub/sub externo (ex.: Redis).
const clientes = new Set();

function registrarCliente(res) {
  clientes.add(res);
  return () => clientes.delete(res);
}

function transmitir(evento, dados) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const res of clientes) {
    res.write(payload);
  }
}

module.exports = { registrarCliente, transmitir };
