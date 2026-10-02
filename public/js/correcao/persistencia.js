// =====================================================================
// Correção anotada — persistência (professor).
// Correcao.Persistencia.criar(producaoId, { onEstado(estado, detalhe) })
//   anotações: listar · criar · atualizar · remover · restaurar
//   avaliação: agendar(fnDados) (salvamento automático) · salvarAgora() · descarregar()
//   historico() · concluir() · reabrir()
// Estado do salvamento: "salvo" | "salvando" | "pendente" | "erro". A avaliação também fica
// numa cópia local (localStorage) até o servidor confirmar: recarregar a página não perde nada.
// =====================================================================
(function () {
  var C = window.Correcao;
  var ESPERA_MS = 1200;

  function criar(id, op) {
    op = op || {};
    var emVoo = 0, pendente = false, ultimoErro = null, timer = null, fnDados = null, promessaAtual = null;
    var chaveLocal = 'fnm-correcao-rascunho:' + id;

    function avisar() {
      var estado = ultimoErro ? 'erro' : emVoo ? 'salvando' : pendente ? 'pendente' : 'salvo';
      if (op.onEstado) op.onEstado(estado, ultimoErro);
    }
    function req(metodo, url, corpo) {
      emVoo++; avisar();
      return fetch(url, { method: metodo, headers: C.headers(!!corpo), body: corpo ? JSON.stringify(corpo) : undefined })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) { var e = new Error(d.msg || 'Erro ' + r.status); e.status = r.status; throw e; }
            return d;
          });
        })
        .then(function (d) { emVoo--; ultimoErro = null; avisar(); if (metodo !== 'GET' && op.onGravado) op.onGravado(d); return d; },
          function (e) { emVoo--; ultimoErro = e.message || 'Não foi possível salvar.'; avisar(); throw e; });
    }
    var base = '/api/producoes/' + id;

    // ---------- avaliação: salvamento automático com cópia local ----------
    function salvarAvaliacao(extra) {
      clearTimeout(timer); timer = null;
      if (!fnDados) return Promise.resolve();
      var dados = fnDados();
      if (extra) for (var k in extra) dados[k] = extra[k];
      pendente = false;
      promessaAtual = req('PUT', base + '/avaliacao', dados).then(function (d) {
        try { localStorage.removeItem(chaveLocal); } catch (e) { /* ok */ }
        if (op.onAvaliacaoSalva) op.onAvaliacaoSalva(d);
        return d;
      }, function (e) { pendente = true; avisar(); throw e; });
      return promessaAtual;
    }

    return {
      listar: function () { return req('GET', base + '/anotacoes').then(function (d) { return d.anotacoes || []; }); },
      criar: function (dados) { return req('POST', base + '/anotacoes', dados).then(function (d) { return d.anotacao; }); },
      atualizar: function (aid, dados) { return req('PUT', base + '/anotacoes/' + aid, dados).then(function (d) { return d.anotacao; }); },
      remover: function (aid) { return req('DELETE', base + '/anotacoes/' + aid); },
      restaurar: function (aid) { return req('PUT', base + '/anotacoes/' + aid, { removido: false }).then(function (d) { return d.anotacao; }); },
      historico: function () { return req('GET', base + '/historico'); },
      concluir: function () { return req('POST', base + '/concluir'); },
      reabrir: function () { return req('POST', base + '/reabrir'); },

      // Marca a avaliação como alterada e salva sozinho depois de uma pausa na digitação.
      agendar: function (fn) {
        fnDados = fn || fnDados;
        pendente = true; avisar();
        try { localStorage.setItem(chaveLocal, JSON.stringify({ dados: fnDados(), em: Date.now() })); } catch (e) { /* ok */ }
        clearTimeout(timer);
        timer = setTimeout(function () { salvarAvaliacao().catch(function () {}); }, ESPERA_MS);
      },
      definirDados: function (fn) { fnDados = fn; },
      salvarAgora: function (extra) { return salvarAvaliacao(extra); },
      // Garante que nada fica pendente (antes de concluir, devolver ou trocar de produção).
      descarregar: function () {
        if (pendente || timer) return salvarAvaliacao();
        return promessaAtual ? promessaAtual.catch(function () {}) : Promise.resolve();
      },
      temPendencias: function () { return pendente || emVoo > 0 || !!timer; },
      // Cópia local mais nova que o último salvamento do servidor (ex.: queda de conexão).
      copiaLocal: function (salvaEmServidor) {
        try {
          var x = JSON.parse(localStorage.getItem(chaveLocal) || 'null');
          if (x && x.dados && (!salvaEmServidor || x.em > new Date(salvaEmServidor).getTime() + 1000)) return x;
        } catch (e) { /* ok */ }
        return null;
      },
      descartarCopiaLocal: function () { try { localStorage.removeItem(chaveLocal); } catch (e) { /* ok */ } },
      parar: function () { clearTimeout(timer); timer = null; fnDados = null; }
    };
  }

  C.Persistencia = { criar: criar };
})();
