// =====================================================================
// SEED — 30 temas de produção escrita (TCF/TEF/DELF/DALF) + rubricas.
// Execute manualmente com: node backend/seed/temas.js
// Não é carregado automaticamente pelo servidor.
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const Tema = require("../models/tema");
const Rubrica = require("../models/rubrica");

const CRITERIOS_PADRAO = [
  { nome: "Organização do texto", peso: 1, descricao: "Estrutura em parágrafos e progressão lógica das ideias." },
  { nome: "Vocabulário", peso: 1, descricao: "Variedade e precisão lexical adequadas ao nível." },
  { nome: "Gramática", peso: 1, descricao: "Correção morfossintática, conjugações e concordâncias." },
  { nome: "Ortografia", peso: 1, descricao: "Grafia correta das palavras e pontuação." },
  { nome: "Coesão", peso: 1, descricao: "Uso de conectores e articuladores do discurso." },
  { nome: "Adequação ao tema", peso: 1, descricao: "Cumprimento da consigne e pertinência das ideias." },
  { nome: "Registro linguístico", peso: 1, descricao: "Adequação do nível de formalidade ao gênero textual pedido." }
];

const RUBRICAS = ["TCF", "TEF", "DELF", "DALF"].map(exame => ({ exame, criterios: CRITERIOS_PADRAO, notaMaxima: 20 }));

const TEMAS = [

// ===================== DELF A2 (3) =====================
{
  titulo: "Message à un ami pour annuler un rendez-vous",
  exame: "DELF", nivel: "A2", tipoProducao: "Message informel", dificuldade: "facil",
  descricao: "Prática de escrita de uma mensagem informal curta, como as cobradas na prova de expressão escrita do DELF A2.",
  objetivos: ["Escrever uma mensagem informal clara e coesa", "Justificar uma mudança de planos de forma educada", "Usar fórmulas de saudação e despedida adequadas ao registro informal"],
  instrucoes: "Vous deviez retrouver votre ami(e) Camille samedi après-midi pour aller au cinéma, mais vous ne pouvez plus venir. Écrivez-lui un message pour annuler le rendez-vous, expliquer la raison et proposer une nouvelle date. (40 à 60 mots)",
  criteriosResumo: ["Clareza da mensagem", "Fórmulas de cortesia", "Correção gramatical básica"],
  tempoSugerido: 20, limitePalavrasMin: 40, limitePalavrasMax: 70, creditosNecessarios: 1,
  competenciasAvaliadas: ["Escrita informal", "Justificativa simples", "Futuro próximo e passé composé"],
  coletanea: [
    { tipo: "artigo", titulo: "Comment écrire un message amical efficace", fonte: "Blog Français Facile", autor: "Rédaction", data: "2025", conteudo: "Un bon message amical va droit au but : on salue la personne, on explique la raison de son message en une ou deux phrases, puis on termine par une formule chaleureuse. Pour annuler un rendez-vous, il est poli de s'excuser et de proposer une solution, comme une nouvelle date. Des expressions comme « je suis désolé(e) », « est-ce que tu es libre... » ou « à bientôt » sont très utiles dans ce type d'écrit.", permiteDownload: false },
    { tipo: "documento_oficial", titulo: "Grille d'évaluation DELF A2 — Production écrite (extrait pédagogique)", fonte: "Modèle inspiré du CECRL", autor: "", data: "2024", conteudo: "Pour la production écrite du DELF A2, le candidat doit rédiger un texte court (lettre, message, carte postale) en respectant la consigne, avec un vocabulaire élémentaire mais varié et une syntaxe simple. Les critères principaux sont : respect de la consigne, capacité à raconter et décrire, correction morphosyntaxique de base et richesse du lexique utilisé.", permiteDownload: false }
  ]
},
{
  titulo: "Décrire son quartier à un correspondant",
  exame: "DELF", nivel: "A2", tipoProducao: "Message informel", dificuldade: "facil",
  descricao: "Descrição simples de um lugar familiar, com vocabulário de bairro e rotina.",
  objetivos: ["Descrever um lugar usando vocabulário básico", "Expressar gostos e preferências", "Organizar ideias em frases simples e conectadas"],
  instrucoes: "Un(e) correspondant(e) français(e) vous demande de décrire votre quartier dans un message. Parlez des lieux importants (magasins, parcs, transports) et dites ce que vous aimez y faire. (40 à 60 mots)",
  criteriosResumo: ["Vocabulário de lugares", "Uso de adjetivos", "Coerência da descrição"],
  tempoSugerido: 20, limitePalavrasMin: 40, limitePalavrasMax: 70, creditosNecessarios: 1,
  competenciasAvaliadas: ["Descrição de lugares", "Expressão de preferências", "Presente do indicativo"],
  coletanea: [
    { tipo: "artigo", titulo: "Le vocabulaire du quartier", fonte: "Ressources FLE", autor: "Rédaction", data: "2025", conteudo: "Pour décrire son quartier, on utilise des mots comme « la boulangerie », « le parc », « la pharmacie », « l'arrêt de bus » ou « la place ». On peut aussi parler de l'ambiance : « calme », « animé », « bruyant ». Pour exprimer ses préférences, on dit « j'aime bien », « ce que je préfère, c'est... » ou « le week-end, j'aime aller à... ».", permiteDownload: false },
    { tipo: "tabela", titulo: "Lieux et activités du quotidien", fonte: "Glossaire pédagogique", autor: "", data: "2025", conteudo: "Lieu — Activité associée : Le parc — se promener, faire du sport ; Le marché — acheter des fruits et légumes ; La bibliothèque — emprunter des livres ; Le café — retrouver des amis ; La place du village — assister à des événements.", permiteDownload: false }
  ]
},
{
  titulo: "Lettre pour inviter un ami à une fête",
  exame: "DELF", nivel: "A2", tipoProducao: "Lettre amicale", dificuldade: "facil",
  descricao: "Redação de um convite informal, incluindo informações práticas (data, hora, local).",
  objetivos: ["Redigir um convite completo e organizado", "Fornecer informações práticas de forma clara", "Usar o imperativo para convidar"],
  instrucoes: "Vous organisez une fête pour votre anniversaire. Écrivez une lettre à un ami pour l'inviter : donnez la date, l'heure, le lieu, et dites ce qu'il faut apporter. (40 à 60 mots)",
  criteriosResumo: ["Informações completas", "Uso do imperativo", "Tom amigável"],
  tempoSugerido: 20, limitePalavrasMin: 40, limitePalavrasMax: 70, creditosNecessarios: 1,
  competenciasAvaliadas: ["Convite formal/informal", "Imperativo", "Informações práticas"],
  coletanea: [
    { tipo: "artigo", titulo: "Rédiger une invitation réussie", fonte: "Blog Français Facile", autor: "Rédaction", data: "2025", conteudo: "Une bonne invitation répond toujours aux questions : quoi, quand, où et quoi apporter. On peut utiliser l'impératif pour inviter : « Viens fêter mon anniversaire ! », « N'oublie pas d'apporter... ». Il est aussi sympathique de terminer par une phrase enthousiaste comme « J'ai hâte de te voir ! ».", permiteDownload: false },
    { tipo: "documento_oficial", titulo: "Exemple de carton d'invitation", fonte: "Modèle pédagogique", autor: "", data: "2024", conteudo: "Anniversaire de Léa — Samedi 14 juin à partir de 18h — Chez Léa, 12 rue des Lilas — Merci d'apporter une boisson ou un dessert. RSVP avant le 10 juin.", permiteDownload: false }
  ]
},

// ===================== DELF B1 (4) =====================
{
  titulo: "Le télétravail : pour ou contre ?",
  exame: "DELF", nivel: "B1", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Redação argumentativa de opinião sobre trabalho remoto, no formato clássico do DELF B1.",
  objetivos: ["Expressar e justificar uma opinião pessoal", "Apresentar argumentos organizados com conectores", "Concluir de forma coerente com a posição defendida"],
  instrucoes: "Un magazine en ligne demande à ses lecteurs : « Le télétravail est-il une bonne chose pour les salariés ? » Vous décidez de répondre en donnant votre opinion, avec des arguments et des exemples. (160 à 180 mots)",
  criteriosResumo: ["Opinião clara", "Argumentos justificados", "Uso de conectores lógicos"],
  tempoSugerido: 45, limitePalavrasMin: 160, limitePalavrasMax: 190, creditosNecessarios: 1,
  competenciasAvaliadas: ["Argumentação simples", "Conectores (d'abord, ensuite, enfin)", "Expressão de opinião"],
  coletanea: [
    { tipo: "artigo", titulo: "Le télétravail a transformé nos habitudes", fonte: "Journal Le Quotidien (fictif)", autor: "M. Fontaine", data: "2025", conteudo: "Depuis quelques années, de plus en plus d'entreprises proposent le télétravail à leurs employés. Les salariés apprécient surtout le gain de temps sur les trajets et une meilleure organisation de leur journée. Cependant, certains regrettent le manque de contact avec leurs collègues et la difficulté à séparer vie professionnelle et vie personnelle.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Sondage : opinion des salariés sur le télétravail", fonte: "Institut d'études fictif Opinio", autor: "", data: "2025",
      conteudo: "Résultats d'un sondage auprès de 1000 salariés : 62% se disent plus productifs en télétravail ; 45% déclarent se sentir plus isolés ; 78% souhaitent continuer à télétravailler au moins deux jours par semaine.",
      dadosGrafico: { labels: ["Plus productifs", "Se sentent isolés", "Veulent continuer"], valores: [62, 45, 78], unidade: "% des salariés interrogés" },
      permiteDownload: false }
  ]
},
{
  titulo: "Les réseaux sociaux et les jeunes",
  exame: "DELF", nivel: "B1", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Debate sobre o impacto das redes sociais na juventude, exercitando argumentação equilibrada.",
  objetivos: ["Apresentar pontos positivos e negativos de um tema", "Usar exemplos concretos para ilustrar argumentos", "Formular uma conclusão pessoal"],
  instrucoes: "Vous participez à un forum en ligne sur l'éducation. Le sujet du jour est : « Les réseaux sociaux sont-ils bons ou mauvais pour les jeunes ? » Donnez votre opinion avec des arguments précis. (160 à 180 mots)",
  criteriosResumo: ["Equilíbrio de argumentos", "Exemplos concretos", "Conclusão pessoal"],
  tempoSugerido: 45, limitePalavrasMin: 160, limitePalavrasMax: 190, creditosNecessarios: 1,
  competenciasAvaliadas: ["Argumentação equilibrada", "Exemplificação", "Vocabulário de opinião"],
  coletanea: [
    { tipo: "entrevista", titulo: "Interview : « Les jeunes et les réseaux sociaux »", fonte: "Radio Jeunesse (fictive)", autor: "Propos recueillis par S. Morel", data: "2025", conteudo: "— Les réseaux sociaux sont-ils dangereux pour les adolescents ? — Ce n'est pas si simple. Ils permettent de rester en contact avec des amis et de découvrir des informations, mais l'usage excessif peut affecter le sommeil et la concentration. Le plus important, c'est d'apprendre aux jeunes à les utiliser avec modération et esprit critique.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Temps passé sur les réseaux sociaux par tranche d'âge", fonte: "Observatoire du numérique (fictif)", autor: "", data: "2025",
      conteudo: "Temps moyen quotidien passé sur les réseaux sociaux : 13-15 ans : 2h10 ; 16-18 ans : 2h50 ; 19-25 ans : 2h30.",
      dadosGrafico: { labels: ["13-15 ans", "16-18 ans", "19-25 ans"], valores: [130, 170, 150], unidade: "minutes par jour" },
      permiteDownload: false }
  ]
},
{
  titulo: "Voyager seul ou en groupe ?",
  exame: "DELF", nivel: "B1", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Comparação de duas formas de viajar, treinando estruturas comparativas e argumentação pessoal.",
  objetivos: ["Comparar duas opções com argumentos", "Usar estruturas comparativas corretamente", "Expressar preferência pessoal justificada"],
  instrucoes: "Sur le blog de voyage auquel vous participez, on vous demande : « Préférez-vous voyager seul(e) ou en groupe ? » Donnez votre avis en comparant les avantages et les inconvénients des deux options. (160 à 180 mots)",
  criteriosResumo: ["Comparação clara", "Estruturas comparativas", "Preferência justificada"],
  tempoSugerido: 45, limitePalavrasMin: 160, limitePalavrasMax: 190, creditosNecessarios: 1,
  competenciasAvaliadas: ["Comparação (plus... que, moins... que)", "Argumentação", "Vocabulário de viagem"],
  coletanea: [
    { tipo: "artigo", titulo: "Voyage solo : la liberté avant tout", fonte: "Magazine Évasion (fictif)", autor: "C. Duval", data: "2025", conteudo: "De plus en plus de voyageurs choisissent de partir seuls. Cette formule permet une liberté totale dans l'organisation de l'itinéraire et favorise les rencontres avec d'autres voyageurs. En revanche, voyager seul peut parfois être source de solitude, surtout lors de longs trajets.", permiteDownload: false },
    { tipo: "noticia", titulo: "Le voyage en groupe séduit de nouveau les jeunes", fonte: "Journal Le Quotidien (fictif)", autor: "P. Lambert", data: "2025", conteudo: "Après plusieurs années de baisse, les voyages organisés en groupe connaissent un regain d'intérêt chez les 18-25 ans. Les agences expliquent ce succès par la sécurité, le partage des coûts et la possibilité de se faire de nouveaux amis pendant le séjour.", permiteDownload: false }
  ]
},
{
  titulo: "Faut-il réduire les déchets plastiques ?",
  exame: "DELF", nivel: "B1", tipoProducao: "Lettre formelle", dificuldade: "medio",
  descricao: "Carta formal de opinião dirigida a uma autoridade municipal sobre um tema ambiental.",
  objetivos: ["Redigir uma carta formal com estrutura adequada", "Propor soluções concretas para um problema", "Usar fórmulas de abertura e fechamento formais"],
  instrucoes: "Vous écrivez une lettre au maire de votre ville pour proposer des mesures afin de réduire l'utilisation du plastique dans les commerces locaux. Présentez le problème et vos propositions. (160 à 180 mots)",
  criteriosResumo: ["Estrutura formal", "Propostas concretas", "Registro formal adequado"],
  tempoSugerido: 45, limitePalavrasMin: 160, limitePalavrasMax: 190, creditosNecessarios: 1,
  competenciasAvaliadas: ["Carta formal", "Registro linguístico formal", "Proposta de soluções"],
  coletanea: [
    { tipo: "documento_oficial", titulo: "Extrait d'un plan municipal de réduction des déchets", fonte: "Mairie fictive de Beaumont", autor: "Service Environnement", data: "2025", conteudo: "La municipalité s'engage à réduire de 30% les déchets plastiques d'ici 2028, en interdisant les sacs à usage unique dans les marchés et en encourageant les commerçants à proposer des alternatives réutilisables. Un fonds sera créé pour aider les petits commerces dans cette transition.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Déchets plastiques dans la ville de Beaumont", fonte: "Rapport environnemental fictif", autor: "", data: "2024",
      conteudo: "Quantité de déchets plastiques collectés par an (en tonnes) : 2021 : 420 ; 2022 : 460 ; 2023 : 510 ; 2024 : 480.",
      dadosGrafico: { labels: ["2021", "2022", "2023", "2024"], valores: [420, 460, 510, 480], unidade: "tonnes de plastique collectées" },
      permiteDownload: false }
  ]
},

// ===================== DELF B2 (3) =====================
{
  titulo: "L'intelligence artificielle va-t-elle remplacer les humains au travail ?",
  exame: "DELF", nivel: "B2", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Dissertação argumentativa sobre um tema contemporâneo, no padrão de expressão escrita do DELF B2.",
  objetivos: ["Estruturar uma dissertação com introdução, desenvolvimento e conclusão", "Antecipar e refutar um contra-argumento", "Utilizar vocabulário mais nuançado sobre tecnologia e trabalho"],
  instrucoes: "Dans le cadre d'un débat organisé par votre université, vous devez rédiger un essai argumentatif répondant à la question : « L'intelligence artificielle va-t-elle remplacer les humains au travail ? » Développez une argumentation structurée, avec des exemples précis. (250 mots environ)",
  criteriosResumo: ["Estrutura argumentativa completa", "Contra-argumentação", "Vocabulário nuançado"],
  tempoSugerido: 60, limitePalavrasMin: 220, limitePalavrasMax: 280, creditosNecessarios: 2,
  competenciasAvaliadas: ["Dissertação estruturada", "Refutação de contra-argumentos", "Registro formal/acadêmico"],
  coletanea: [
    { tipo: "artigo", titulo: "L'IA transforme le monde du travail", fonte: "Revue Économie & Société (fictive)", autor: "Dr. A. Renaud", data: "2025", conteudo: "L'intelligence artificielle automatise déjà de nombreuses tâches répétitives dans l'industrie, la comptabilité et le service client. Si certains experts alertent sur la disparition de millions d'emplois, d'autres soulignent que de nouveaux métiers émergent, liés à la conception, à la supervision et à la maintenance de ces technologies. L'enjeu principal reste la formation des travailleurs à ces nouvelles compétences.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« L'IA ne remplace pas, elle transforme »", fonte: "Podcast Futur du Travail (fictif)", autor: "Propos recueillis par L. Berger", data: "2025", conteudo: "— Doit-on craindre l'intelligence artificielle ? — Je pense qu'il faut nuancer. L'IA excelle dans les tâches répétitives, mais elle peine encore à remplacer la créativité, l'empathie ou le jugement complexe. Le vrai défi, c'est d'accompagner les travailleurs vers des métiers où ces qualités humaines restent essentielles.", permiteDownload: false }
  ]
},
{
  titulo: "Faut-il interdire les téléphones portables à l'école ?",
  exame: "DELF", nivel: "B2", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Dissertação argumentativa sobre política educacional, exercitando estrutura de tese e refutação.",
  objetivos: ["Defender uma posição com argumentos hierarquizados", "Considerar diferentes pontos de vista (alunos, pais, professores)", "Concluir com uma proposta equilibrada"],
  instrucoes: "Le ministère de l'Éducation envisage d'interdire les téléphones portables dans les collèges et lycées. Rédigez un essai argumentatif exprimant votre position sur cette mesure, en tenant compte des différents points de vue concernés. (250 mots environ)",
  criteriosResumo: ["Argumentos hierarquizados", "Múltiplos pontos de vista", "Proposta de conclusão"],
  tempoSugerido: 60, limitePalavrasMin: 220, limitePalavrasMax: 280, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação multifacetada", "Registro formal", "Vocabulário educacional"],
  coletanea: [
    { tipo: "noticia", titulo: "Plusieurs pays testent l'interdiction du téléphone à l'école", fonte: "Journal Le Quotidien (fictif)", autor: "R. Nguyen", data: "2025", conteudo: "Depuis la rentrée, plusieurs établissements scolaires appliquent une interdiction stricte des téléphones portables durant les heures de classe et les récréations. Les premiers résultats montrent une baisse des conflits liés au harcèlement en ligne, mais certains parents s'inquiètent de ne plus pouvoir joindre leurs enfants en cas d'urgence.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Opinion des enseignants sur l'usage du téléphone en classe", fonte: "Enquête syndicale fictive", autor: "", data: "2025",
      conteudo: "Sur 500 enseignants interrogés : 71% sont favorables à une interdiction totale ; 22% préfèrent un usage encadré pour des activités pédagogiques ; 7% jugent l'interdiction inutile.",
      dadosGrafico: { labels: ["Interdiction totale", "Usage encadré", "Interdiction inutile"], valores: [71, 22, 7], unidade: "% des enseignants interrogés" },
      permiteDownload: false }
  ]
},
{
  titulo: "Le tourisme de masse : une menace pour le patrimoine ?",
  exame: "DELF", nivel: "B2", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Dissertação sobre turismo e patrimônio cultural, articulando dados e opinião pessoal.",
  objetivos: ["Integrar dados estatísticos na argumentação", "Discutir causas e consequências de um fenômeno social", "Propor soluções realistas"],
  instrucoes: "Un magazine culturel vous invite à réagir à la question suivante : « Le tourisme de masse menace-t-il le patrimoine culturel et naturel ? » Structurez votre réponse en présentant les enjeux et vos propositions. (250 mots environ)",
  criteriosResumo: ["Uso de dados na argumentação", "Discussão causa-efeito", "Propostas realistas"],
  tempoSugerido: 60, limitePalavrasMin: 220, limitePalavrasMax: 280, creditosNecessarios: 2,
  competenciasAvaliadas: ["Análise causa-efeito", "Uso de dados estatísticos", "Vocabulário de patrimônio e turismo"],
  coletanea: [
    { tipo: "artigo", titulo: "Venise, victime de son succès touristique", fonte: "Revue Patrimoine & Voyage (fictive)", autor: "M. Ferrand", data: "2025", conteudo: "Chaque année, des millions de touristes visitent Venise, une ville qui compte à peine 50 000 habitants. Cette affluence fragilise les monuments historiques, fait grimper le coût de la vie pour les résidents et pousse de nombreuses familles à quitter le centre historique. Plusieurs associations réclament désormais une limitation du nombre de visiteurs quotidiens.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Évolution du nombre de touristes à Venise", fonte: "Office du tourisme (données fictives)", autor: "", data: "2025",
      conteudo: "Nombre de visiteurs annuels (en millions) : 2015 : 24 ; 2019 : 30 ; 2023 : 27 ; 2025 (estimation) : 32.",
      dadosGrafico: { labels: ["2015", "2019", "2023", "2025 (est.)"], valores: [24, 30, 27, 32], unidade: "millions de visiteurs par an" },
      permiteDownload: false }
  ]
}

,

// ===================== DALF C1 (3) =====================
{
  titulo: "La ville de demain : quelles priorités ?",
  exame: "DALF", nivel: "C1", tipoProducao: "Synthèse de documents", dificuldade: "dificil",
  descricao: "Síntese argumentativa a partir de documentos de apoio, no formato típico da produção escrita do DALF C1.",
  objetivos: ["Sintetizar informações de fontes diferentes sem copiar trechos literais", "Articular uma reflexão pessoal a partir dos documentos", "Empregar conectores lógicos sofisticados e vocabulário urbanístico"],
  instrucoes: "À partir des documents proposés dans la collection, rédigez une synthèse argumentative (environ 250 mots) répondant à la question : « Quelles doivent être les priorités des villes pour les prochaines décennies ? » Vous devez reformuler les idées des documents sans les recopier et proposer votre propre analyse.",
  criteriosResumo: ["Síntese sem cópia literal", "Reflexão pessoal integrada", "Conectores avançados"],
  tempoSugerido: 90, limitePalavrasMin: 220, limitePalavrasMax: 280, creditosNecessarios: 2,
  competenciasAvaliadas: ["Síntese de documentos", "Reformulação", "Vocabulário urbanístico e ambiental"],
  coletanea: [
    { tipo: "artigo", titulo: "Vers des villes plus vertes", fonte: "Revue Urbanisme Demain (fictive)", autor: "T. Aubry", data: "2025", conteudo: "De nombreuses métropoles investissent massivement dans les espaces verts, les pistes cyclables et les transports en commun électriques. Ces politiques visent à réduire la pollution et à améliorer la qualité de vie des habitants, mais elles nécessitent des budgets considérables et une adhésion durable des citoyens aux nouvelles habitudes de mobilité.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« La ville de demain doit d'abord être inclusive »", fonte: "Revue Architecture & Société (fictive)", autor: "Propos recueillis par H. Vidal", data: "2025", conteudo: "— Quelle est, selon vous, la priorité numéro un pour les villes futures ? — L'écologie est essentielle, mais elle ne suffit pas. Une ville durable doit aussi être accessible à tous, avec des logements abordables et des services publics de qualité dans tous les quartiers, pas seulement dans les centres-villes déjà privilégiés.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Priorités citoyennes pour l'urbanisme futur", fonte: "Consultation publique fictive", autor: "", data: "2025",
      conteudo: "Résultats d'une consultation citoyenne sur les priorités urbaines : Transports écologiques : 38% ; Logements abordables : 31% ; Espaces verts : 21% ; Sécurité : 10%.",
      dadosGrafico: { labels: ["Transports écologiques", "Logements abordables", "Espaces verts", "Sécurité"], valores: [38, 31, 21, 10], unidade: "% des réponses citoyennes" },
      permiteDownload: false }
  ]
},
{
  titulo: "L'uniformisation culturelle à l'ère de la mondialisation",
  exame: "DALF", nivel: "C1", tipoProducao: "Essai argumentatif", dificuldade: "dificil",
  descricao: "Dissertação de nível avançado sobre globalização cultural, exigindo argumentação nuançada.",
  objetivos: ["Discutir um fenômeno complexo com nuances", "Mobilizar exemplos culturais concretos", "Construir uma argumentação com múltiplas camadas (tese, antítese, síntese)"],
  instrucoes: "Rédigez un essai argumentatif (250 mots environ) sur le sujet suivant : « La mondialisation entraîne-t-elle une uniformisation des cultures, ou permet-elle au contraire leur diffusion et leur enrichissement mutuel ? » Votre texte devra présenter une réflexion nuancée, illustrée d'exemples précis.",
  criteriosResumo: ["Nuance argumentativa", "Exemplos culturais concretos", "Estrutura tese-antítese-síntese"],
  tempoSugerido: 90, limitePalavrasMin: 220, limitePalavrasMax: 280, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação dialética", "Vocabulário sobre cultura e globalização", "Registro acadêmico"],
  coletanea: [
    { tipo: "artigo", titulo: "Le même café partout dans le monde ?", fonte: "Revue Anthropologie Contemporaine (fictive)", autor: "N. Castel", data: "2025", conteudo: "Des grandes chaînes de restauration aux plateformes de streaming, certains observateurs dénoncent une homogénéisation culturelle mondiale, où les mêmes produits et références circulent partout. D'autres chercheurs nuancent ce constat, soulignant que les cultures locales s'approprient et transforment ces influences globales pour créer des formes hybrides originales.", permiteDownload: false },
    { tipo: "documento_oficial", titulo: "Extrait d'un rapport de l'UNESCO sur la diversité culturelle (fictif)", fonte: "UNESCO (document pédagogique fictif)", autor: "", data: "2024", conteudo: "La diversité des expressions culturelles doit être protégée et encouragée face aux risques d'uniformisation liés aux échanges mondialisés. Les politiques culturelles nationales jouent un rôle essentiel pour soutenir la création locale tout en favorisant les échanges internationaux.", permiteDownload: false }
  ]
},
{
  titulo: "Le rôle des médias dans la démocratie",
  exame: "DALF", nivel: "C1", tipoProducao: "Essai argumentatif", dificuldade: "dificil",
  descricao: "Reflexão sobre o papel da imprensa e das mídias digitais na vida democrática.",
  objetivos: ["Analisar criticamente o papel de uma instituição social", "Distinguir diferentes tipos de mídia e seus efeitos", "Formular uma posição pessoal fundamentada"],
  instrucoes: "Rédigez un essai argumentatif (250 mots environ) répondant à la question : « Les médias, notamment numériques, renforcent-ils ou fragilisent-ils la démocratie aujourd'hui ? » Appuyez votre réflexion sur des exemples précis.",
  criteriosResumo: ["Análise crítica", "Distinção entre tipos de mídia", "Posição pessoal fundamentada"],
  tempoSugerido: 90, limitePalavrasMin: 220, limitePalavrasMax: 280, creditosNecessarios: 2,
  competenciasAvaliadas: ["Pensamento crítico", "Vocabulário sobre mídia e política", "Argumentação estruturada"],
  coletanea: [
    { tipo: "artigo", titulo: "Désinformation : un défi pour les démocraties", fonte: "Revue Politique & Société (fictive)", autor: "É. Charpentier", data: "2025", conteudo: "La multiplication des sources d'information sur internet a démocratisé l'accès à l'actualité, mais elle a aussi favorisé la propagation de fausses informations. Plusieurs pays ont mis en place des programmes d'éducation aux médias dans les écoles pour aider les citoyens à développer leur esprit critique face à ces contenus.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« La presse indépendante reste un pilier démocratique »", fonte: "Podcast Actualités & Débats (fictif)", autor: "Propos recueillis par F. Roussel", data: "2025", conteudo: "— Les réseaux sociaux ont-ils affaibli le journalisme traditionnel ? — Ils ont bousculé son modèle économique, c'est certain. Mais le travail de vérification et d'enquête des journalistes professionnels reste irremplaçable pour une démocratie informée. Le vrai danger serait de laisser disparaître ce travail au profit d'une information non vérifiée.", permiteDownload: false }
  ]
}

,

// ===================== DALF C2 (3) =====================
{
  titulo: "Faut-il repenser le modèle économique face à la crise climatique ?",
  exame: "DALF", nivel: "C2", tipoProducao: "Synthèse de documents", dificuldade: "dificil",
  descricao: "Síntese crítica de nível C2, articulando múltiplas fontes sobre economia e clima em um texto extenso e argumentado.",
  objetivos: ["Sintetizar e confrontar posições divergentes de forma sofisticada", "Produzir um texto longo e coeso com registro acadêmico", "Formular uma tese pessoal original a partir do debate apresentado"],
  instrucoes: "En vous appuyant sur les documents de la collection, rédigez une synthèse critique et argumentée (400 à 500 mots) sur la question : « Le modèle économique actuel est-il compatible avec les impératifs de la transition climatique ? » Vous devez confronter les points de vue présentés et proposer une réflexion personnelle approfondie.",
  criteriosResumo: ["Confronto de fontes divergentes", "Registro acadêmico sofisticado", "Tese pessoal original"],
  tempoSugerido: 150, limitePalavrasMin: 380, limitePalavrasMax: 520, creditosNecessarios: 3,
  competenciasAvaliadas: ["Síntese crítica avançada", "Argumentação dialética complexa", "Vocabulário econômico e ambiental especializado"],
  coletanea: [
    { tipo: "artigo", titulo: "La croissance verte, une solution suffisante ?", fonte: "Revue Économie Écologique (fictive)", autor: "Pr. J. Delacroix", data: "2025", conteudo: "Certains économistes défendent l'idée d'une « croissance verte », où l'innovation technologique permettrait de concilier développement économique et réduction des émissions. D'autres estiment que cette approche reste insuffisante face à l'urgence climatique et plaident pour une remise en question plus profonde du modèle de croissance lui-même, notamment à travers la décroissance.", permiteDownload: false },
    { tipo: "documento_oficial", titulo: "Extrait d'un rapport économique international (fictif)", fonte: "Organisation internationale fictive", autor: "", data: "2024", conteudo: "Les scénarios les plus optimistes de découplage entre croissance économique et émissions de gaz à effet de serre reposent sur des hypothèses technologiques encore incertaines. Une transition réussie nécessitera probablement une combinaison de sobriété, d'innovation et de redistribution des ressources à l'échelle mondiale.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« La décroissance n'est pas un retour en arrière »", fonte: "Revue Alternatives Économiques (fictive)", autor: "Propos recueillis par C. Lenoir", data: "2025", conteudo: "— La décroissance est-elle réaliste ? — Le mot fait peur, mais l'idée est simple : produire et consommer moins dans les pays riches, tout en garantissant un niveau de vie digne à tous. Ce n'est pas un renoncement au progrès, mais une redéfinition de ce que nous considérons comme du progrès.", permiteDownload: false }
  ]
},
{
  titulo: "L'intelligence artificielle et l'avenir de la création artistique",
  exame: "DALF", nivel: "C2", tipoProducao: "Essai argumentatif", dificuldade: "dificil",
  descricao: "Ensaio crítico de nível C2 sobre inteligência artificial e criação artística, com exigência de profundidade filosófica.",
  objetivos: ["Explorar as implicações filosóficas de um tema tecnológico", "Articular argumentos estéticos, éticos e econômicos", "Sustentar uma posição original com grande precisão vocabular"],
  instrucoes: "Rédigez un essai critique (400 à 500 mots) sur le sujet suivant : « L'intelligence artificielle peut-elle véritablement créer de l'art, ou reste-t-elle un outil au service de la créativité humaine ? » Votre réflexion devra aborder les dimensions esthétique, éthique et économique de la question.",
  criteriosResumo: ["Profundidade filosófica", "Multidimensionalidade (estética/ética/economia)", "Precisão vocabular"],
  tempoSugerido: 150, limitePalavrasMin: 380, limitePalavrasMax: 520, creditosNecessarios: 3,
  competenciasAvaliadas: ["Ensaio crítico de nível avançado", "Argumentação filosófica", "Vocabulário artístico e tecnológico especializado"],
  coletanea: [
    { tipo: "artigo", titulo: "Quand une IA remporte un concours de peinture", fonte: "Revue Arts & Technologies (fictive)", autor: "V. Rambert", data: "2025", conteudo: "La victoire d'une œuvre générée par intelligence artificielle dans un concours artistique a relancé un débat déjà ancien : peut-on parler de créativité lorsque l'auteur est un algorithme entraîné sur des millions d'images existantes ? Pour certains critiques, il s'agit d'un simple recombinaison statistique ; pour d'autres, la frontière entre imitation et création originale a toujours été floue, même chez les artistes humains.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« L'IA nous oblige à redéfinir la notion d'auteur »", fonte: "Revue Esthétique Contemporaine (fictive)", autor: "Propos recueillis par O. Simonet", data: "2025", conteudo: "— Une œuvre créée par une IA a-t-elle une valeur artistique ? — La question n'est peut-être pas de savoir si l'IA « crée », mais de comprendre ce que cela change pour notre définition de l'auteur et de l'intention artistique. L'humain qui choisit, sélectionne et donne un sens à l'œuvre reste, selon moi, central dans le processus.", permiteDownload: false }
  ]
},
{
  titulo: "Le vieillissement de la population : un défi pour la société",
  exame: "DALF", nivel: "C2", tipoProducao: "Synthèse de documents", dificuldade: "dificil",
  descricao: "Síntese crítica sobre envelhecimento populacional, mobilizando dados demográficos e diferentes perspectivas sociais.",
  objetivos: ["Interpretar e integrar dados demográficos complexos", "Articular perspectivas econômicas, sociais e éticas", "Produzir uma síntese longa e argumentativamente sofisticada"],
  instrucoes: "À partir des documents fournis, rédigez une synthèse critique et argumentée (400 à 500 mots) sur la question : « Le vieillissement démographique doit-il être perçu comme une menace ou comme une opportunité pour nos sociétés ? »",
  criteriosResumo: ["Interpretação de dados demográficos", "Múltiplas perspectivas (econômica/social/ética)", "Síntese longa e sofisticada"],
  tempoSugerido: 150, limitePalavrasMin: 380, limitePalavrasMax: 520, creditosNecessarios: 3,
  competenciasAvaliadas: ["Síntese de dados complexos", "Argumentação multidimensional", "Vocabulário demográfico e social especializado"],
  coletanea: [
    { tipo: "estatistica", titulo: "Évolution de la part des plus de 65 ans en Europe", fonte: "Institut démographique fictif Eurostat-like", autor: "", data: "2025",
      conteudo: "Part de la population âgée de plus de 65 ans en Europe : 2000 : 15% ; 2010 : 17% ; 2020 : 20% ; 2040 (projection) : 29%.",
      dadosGrafico: { labels: ["2000", "2010", "2020", "2040 (proj.)"], valores: [15, 17, 20, 29], unidade: "% de la population totale" },
      permiteDownload: false },
    { tipo: "artigo", titulo: "Le vieillissement, un moteur économique méconnu", fonte: "Revue Économie & Société (fictive)", autor: "Dr. S. Weiss", data: "2025", conteudo: "Si le vieillissement de la population est souvent présenté comme une menace pour les systèmes de retraite et de santé, il représente aussi un potentiel économique important : la « silver economy », liée aux besoins spécifiques des seniors, crée des emplois dans les services à la personne, la santé et les loisirs adaptés.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« Il faut repenser la place des seniors dans la société »", fonte: "Revue Politique Sociale (fictive)", autor: "Propos recueillis par D. Mercier", data: "2025", conteudo: "— Comment la société doit-elle s'adapter au vieillissement démographique ? — Il ne s'agit pas seulement de financer les retraites, mais de repenser l'urbanisme, la santé, le travail intergénérationnel. Les seniors ont aussi beaucoup à apporter, notamment en termes d'expérience et de transmission, si on leur donne une vraie place dans la vie collective.", permiteDownload: false }
  ]
}

,

// ===================== TCF (7) =====================
{
  titulo: "Message court : proposer un rendez-vous à un collègue",
  exame: "TCF", nivel: "A2", tipoProducao: "Expression écrite (tâche courte)", dificuldade: "facil",
  descricao: "Primeira tarefa da expressão escrita do TCF: uma mensagem curta e prática.",
  objetivos: ["Redigir uma mensagem breve e funcional", "Propor um horário e um local de forma clara", "Usar fórmulas de cortesia profissionais simples"],
  instrucoes: "Écrivez un message à un(e) collègue pour lui proposer un rendez-vous afin de préparer un projet ensemble. Précisez le jour, l'heure et le lieu. (30 à 40 mots)",
  criteriosResumo: ["Clareza da proposta", "Informações práticas completas", "Registro profissional simples"],
  tempoSugerido: 10, limitePalavrasMin: 30, limitePalavrasMax: 50, creditosNecessarios: 1,
  competenciasAvaliadas: ["Mensagem funcional curta", "Marcação de compromissos", "Registro semi-formal"],
  coletanea: [
    { tipo: "artigo", titulo: "Écrire un message professionnel court", fonte: "Guide TCF (ressource pédagogique)", autor: "Rédaction", data: "2025", conteudo: "Un message professionnel court doit être direct : objet clair, information essentielle (jour, heure, lieu) et formule de politesse simple comme « Cordialement » ou « Bonne journée ». Il est inutile d'ajouter des détails superflus dans ce type d'écrit rapide.", permiteDownload: false }
  ]
},
{
  titulo: "Description : votre ville idéale",
  exame: "TCF", nivel: "B1", tipoProducao: "Expression écrite (tâche courte)", dificuldade: "medio",
  descricao: "Descrição imaginativa de uma cidade ideal, mobilizando vocabulário urbano e adjetivos.",
  objetivos: ["Descrever um lugar imaginário com detalhes", "Utilizar adjetivos variados", "Organizar a descrição de forma lógica (do geral ao específico)"],
  instrucoes: "Décrivez votre ville idéale : son organisation, ses habitants, ses activités. Expliquez pourquoi cette ville vous semble idéale. (80 à 100 mots)",
  criteriosResumo: ["Riqueza descritiva", "Organização lógica", "Uso variado de adjetivos"],
  tempoSugerido: 25, limitePalavrasMin: 80, limitePalavrasMax: 110, creditosNecessarios: 1,
  competenciasAvaliadas: ["Descrição imaginativa", "Vocabulário urbano", "Presente do indicativo"],
  coletanea: [
    { tipo: "artigo", titulo: "Les villes qui inspirent les urbanistes", fonte: "Revue Architecture Pratique (fictive)", autor: "L. Chevalier", data: "2025", conteudo: "Les villes considérées comme « idéales » partagent souvent des caractéristiques communes : des espaces verts accessibles, des transports efficaces, une vie de quartier animée et une architecture qui mélange harmonieusement ancien et moderne. Certains urbanistes rêvent aussi de villes où la voiture individuelle serait quasiment absente.", permiteDownload: false }
  ]
},
{
  titulo: "Récit : un voyage inoubliable",
  exame: "TCF", nivel: "B1", tipoProducao: "Expression écrite (tâche courte)", dificuldade: "medio",
  descricao: "Narração de uma experiência pessoal, treinando o uso de tempos do passado.",
  objetivos: ["Narrar uma experiência pessoal de forma cronológica", "Alternar corretamente passé composé e imparfait", "Expressar sentimentos e impressões pessoais"],
  instrucoes: "Racontez un voyage qui vous a particulièrement marqué. Décrivez où vous êtes allé(e), ce que vous avez fait et pourquoi ce voyage a été inoubliable. (80 à 100 mots)",
  criteriosResumo: ["Coerência narrativa", "Uso correto de tempos do passado", "Expressão de sentimentos"],
  tempoSugerido: 25, limitePalavrasMin: 80, limitePalavrasMax: 110, creditosNecessarios: 1,
  competenciasAvaliadas: ["Narração no passado", "Passé composé / imparfait", "Vocabulário de viagem"],
  coletanea: [
    { tipo: "artigo", titulo: "Bien raconter un souvenir de voyage", fonte: "Guide TCF (ressource pédagogique)", autor: "Rédaction", data: "2025", conteudo: "Pour raconter un souvenir, on utilise généralement le passé composé pour les actions principales (« je suis parti », « j'ai visité ») et l'imparfait pour les descriptions et le contexte (« il faisait beau », « les rues étaient animées »). Ajouter une impression personnelle à la fin rend le récit plus vivant.", permiteDownload: false }
  ]
},
{
  titulo: "Argumentation : le sport à l'école est-il essentiel ?",
  exame: "TCF", nivel: "B2", tipoProducao: "Expression écrite (tâche longue)", dificuldade: "medio",
  descricao: "Tarefa longa de argumentação do TCF sobre educação física escolar.",
  objetivos: ["Construir uma argumentação estruturada em torno de uma tese", "Utilizar exemplos concretos do sistema educacional", "Empregar conectores lógicos de forma variada"],
  instrucoes: "Le sport occupe une place importante dans le programme scolaire de nombreux pays. Selon vous, le sport à l'école est-il essentiel au développement des élèves ? Justifiez votre point de vue avec des arguments et des exemples. (200 mots environ)",
  criteriosResumo: ["Tese clara", "Exemplos concretos", "Conectores variados"],
  tempoSugerido: 50, limitePalavrasMin: 180, limitePalavrasMax: 230, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação estruturada", "Vocabulário educacional e esportivo", "Conectores lógicos"],
  coletanea: [
    { tipo: "estatistica", titulo: "Sport à l'école et réussite scolaire", fonte: "Étude pédagogique fictive", autor: "", data: "2025",
      conteudo: "Selon une étude menée dans 200 établissements : les élèves pratiquant au moins 3 heures de sport par semaine ont en moyenne 12% de meilleurs résultats en concentration ; 68% des enseignants estiment que le sport améliore le climat de classe.",
      dadosGrafico: { labels: ["Amélioration concentration", "Enseignants favorables"], valores: [12, 68], unidade: "% (indicateurs différents)" },
      permiteDownload: false },
    { tipo: "entrevista", titulo: "« Le sport enseigne bien plus que la performance physique »", fonte: "Radio Éducation (fictive)", autor: "Propos recueillis par A. Fabre", data: "2025", conteudo: "— Pourquoi le sport est-il important à l'école ? — Il enseigne le travail d'équipe, la gestion de l'échec et la persévérance, des compétences aussi utiles que les matières académiques. Mais il faut aussi veiller à ce qu'il reste inclusif pour les élèves moins à l'aise physiquement.", permiteDownload: false }
  ]
},
{
  titulo: "Argumentation : les avantages et inconvénients du télétravail",
  exame: "TCF", nivel: "B2", tipoProducao: "Expression écrite (tâche longue)", dificuldade: "medio",
  descricao: "Tarefa longa do TCF pedindo ponderação de vantagens e desvantagens de um tema profissional.",
  objetivos: ["Apresentar dois lados de uma questão de forma equilibrada", "Hierarquizar argumentos por importância", "Concluir com uma síntese pessoal"],
  instrucoes: "Le télétravail s'est beaucoup développé ces dernières années. Présentez les avantages et les inconvénients de cette pratique, puis donnez votre opinion personnelle. (200 mots environ)",
  criteriosResumo: ["Equilíbrio de argumentos", "Hierarquização", "Síntese pessoal"],
  tempoSugerido: 50, limitePalavrasMin: 180, limitePalavrasMax: 230, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação equilibrada", "Vocabulário profissional", "Conclusão pessoal"],
  coletanea: [
    { tipo: "artigo", titulo: "Télétravail : un bilan contrasté après plusieurs années", fonte: "Journal Le Quotidien (fictif)", autor: "M. Fontaine", data: "2025", conteudo: "Cinq ans après sa généralisation, le télétravail affiche un bilan nuancé. Les salariés apprécient la flexibilité et la réduction du temps de trajet, mais les entreprises constatent parfois une baisse de la cohésion d'équipe et des difficultés à intégrer les nouveaux employés.", permiteDownload: false },
    { tipo: "tabela", titulo: "Avantages et inconvénients cités par les salariés", fonte: "Enquête interne fictive", autor: "", data: "2025", conteudo: "Avantages les plus cités : flexibilité des horaires, gain de temps de trajet, meilleur équilibre vie pro/perso. Inconvénients les plus cités : isolement social, difficulté à déconnecter, communication d'équipe plus complexe.", permiteDownload: false }
  ]
},
{
  titulo: "Lettre formelle : réclamation à un service client",
  exame: "TCF", nivel: "B1", tipoProducao: "Lettre formelle", dificuldade: "medio",
  descricao: "Redação de uma reclamação formal, exercitando registro formal e estrutura de carta.",
  objetivos: ["Expor um problema de forma clara e educada", "Solicitar uma solução concreta", "Utilizar fórmulas de abertura e fechamento formais"],
  instrucoes: "Vous avez acheté un produit en ligne qui est arrivé endommagé. Écrivez une lettre au service client pour expliquer le problème et demander un remboursement ou un échange. (150 mots environ)",
  criteriosResumo: ["Clareza do problema", "Pedido concreto", "Registro formal correto"],
  tempoSugerido: 35, limitePalavrasMin: 130, limitePalavrasMax: 170, creditosNecessarios: 1,
  competenciasAvaliadas: ["Carta de reclamação", "Registro formal", "Vocabulário de consumo"],
  coletanea: [
    { tipo: "documento_oficial", titulo: "Modèle de lettre de réclamation", fonte: "Guide du consommateur (fictif)", autor: "", data: "2024", conteudo: "Une lettre de réclamation efficace comprend : la description précise du problème (date d'achat, référence de commande), les conséquences pour le client, et une demande claire (remboursement, échange ou réparation). Il est important de rester poli tout en étant ferme sur la demande.", permiteDownload: false }
  ]
},
{
  titulo: "Argumentation : faut-il apprendre plusieurs langues étrangères ?",
  exame: "TCF", nivel: "C1", tipoProducao: "Expression écrite (tâche longue)", dificuldade: "dificil",
  descricao: "Tarefa longa de nível avançado sobre plurilinguismo, exigindo argumentação sofisticada.",
  objetivos: ["Discutir os benefícios cognitivos e sociais do plurilinguismo", "Mobilizar exemplos de diferentes contextos (educação, trabalho, cultura)", "Utilizar um registro mais elaborado e conectores avançados"],
  instrucoes: "Dans un monde de plus en plus connecté, est-il essentiel d'apprendre plusieurs langues étrangères ? Développez votre point de vue avec des arguments variés et des exemples précis. (220 mots environ)",
  criteriosResumo: ["Profundidade argumentativa", "Exemplos multicontextuais", "Registro elaborado"],
  tempoSugerido: 55, limitePalavrasMin: 200, limitePalavrasMax: 250, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação avançada", "Vocabulário sobre linguagem e cognição", "Conectores complexos"],
  coletanea: [
    { tipo: "artigo", titulo: "Le plurilinguisme, un atout cognitif reconnu", fonte: "Revue Sciences Cognitives (fictive)", autor: "Dr. I. Rousseau", data: "2025", conteudo: "Plusieurs études en neurosciences suggèrent que les personnes parlant plusieurs langues développent une meilleure flexibilité cognitive et retardent en moyenne l'apparition de certaines maladies neurodégénératives. Au-delà de l'aspect cognitif, le plurilinguisme facilite aussi l'accès à d'autres cultures et perspectives sur le monde.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Langues parlées par les jeunes Européens", fonte: "Eurobaromètre fictif", autor: "", data: "2025",
      conteudo: "Pourcentage de jeunes de 18-25 ans parlant au moins deux langues étrangères, par pays : Pays A : 78% ; Pays B : 65% ; Pays C : 52% ; Pays D : 41%.",
      dadosGrafico: { labels: ["Pays A", "Pays B", "Pays C", "Pays D"], valores: [78, 65, 52, 41], unidade: "% des 18-25 ans parlant 2+ langues" },
      permiteDownload: false }
  ]
}

,

// ===================== TEF (7) =====================
{
  titulo: "Section A : lettre pour signaler un problème dans un logement",
  exame: "TEF", nivel: "A2", tipoProducao: "Lettre formelle", dificuldade: "facil",
  descricao: "Tarefa curta do TEF (Section A) exigindo comunicação prática e formal simples.",
  objetivos: ["Descrever um problema doméstico de forma objetiva", "Solicitar uma ação ao destinatário", "Usar um registro formal simples adequado ao contexto"],
  instrucoes: "Vous avez un problème de chauffage dans votre appartement. Écrivez une lettre à votre propriétaire pour décrire le problème et demander une intervention rapide. (60 à 80 mots)",
  criteriosResumo: ["Descrição objetiva do problema", "Pedido claro", "Registro formal simples"],
  tempoSugerido: 20, limitePalavrasMin: 60, limitePalavrasMax: 90, creditosNecessarios: 1,
  competenciasAvaliadas: ["Carta formal simples", "Vocabulário de habitação", "Pedido de providência"],
  coletanea: [
    { tipo: "artigo", titulo: "Comment signaler un problème à son propriétaire", fonte: "Guide du locataire (fictif)", autor: "", data: "2025", conteudo: "Pour signaler un problème dans un logement, il est conseillé d'écrire une lettre ou un message décrivant précisément la situation (nature du problème, depuis quand), et de demander clairement une intervention, en précisant si possible un délai souhaité.", permiteDownload: false }
  ]
},
{
  titulo: "Section A : message pour organiser un événement associatif",
  exame: "TEF", nivel: "B1", tipoProducao: "Message informel", dificuldade: "medio",
  descricao: "Tarefa curta do TEF envolvendo organização prática de um evento comunitário.",
  objetivos: ["Organizar informações práticas de um evento", "Mobilizar outras pessoas para uma causa", "Usar um tom motivador e claro"],
  instrucoes: "Vous faites partie d'une association de quartier qui organise une collecte de vêtements pour les personnes dans le besoin. Écrivez un message aux membres pour présenter l'événement et leur demander de participer. (80 à 100 mots)",
  criteriosResumo: ["Informações práticas completas", "Tom motivador", "Chamado à ação"],
  tempoSugerido: 25, limitePalavrasMin: 80, limitePalavrasMax: 110, creditosNecessarios: 1,
  competenciasAvaliadas: ["Comunicação associativa", "Mobilização de grupo", "Vocabulário de solidariedade"],
  coletanea: [
    { tipo: "noticia", titulo: "Les collectes de vêtements se multiplient cet hiver", fonte: "Journal local fictif", autor: "R. Blanchard", data: "2025", conteudo: "Face à la hausse de la précarité, plusieurs associations organisent des collectes de vêtements chauds dans les quartiers. Les bénévoles soulignent l'importance de mobiliser les habitants tôt dans la saison, avant les grands froids de l'hiver.", permiteDownload: false }
  ]
},
{
  titulo: "Section B : les avantages de la vie en colocation",
  exame: "TEF", nivel: "B1", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Tarefa longa do TEF (Section B) sobre um tema de vida cotidiana.",
  objetivos: ["Apresentar vantagens de um modo de vida com argumentos", "Considerar também possíveis desafios", "Concluir com uma opinião pessoal"],
  instrucoes: "De plus en plus de jeunes choisissent de vivre en colocation. Quels sont, selon vous, les avantages de ce mode de vie ? Y voyez-vous aussi des inconvénients ? (160 à 180 mots)",
  criteriosResumo: ["Argumentos claros", "Consideração de desafios", "Opinião pessoal"],
  tempoSugerido: 40, limitePalavrasMin: 150, limitePalavrasMax: 190, creditosNecessarios: 1,
  competenciasAvaliadas: ["Argumentação sobre modo de vida", "Vocabulário de habitação compartilhada", "Expressão de opinião"],
  coletanea: [
    { tipo: "artigo", titulo: "La colocation, un choix économique et social", fonte: "Magazine Vie Étudiante (fictif)", autor: "P. Garnier", data: "2025", conteudo: "Face à la hausse des loyers, de plus en plus de jeunes actifs et étudiants optent pour la colocation. Ce mode de vie permet de réduire les coûts et de rompre l'isolement, mais il exige aussi une bonne communication pour éviter les conflits liés au partage des tâches ménagères.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Colocation chez les 20-30 ans", fonte: "Enquête logement fictive", autor: "", data: "2025",
      conteudo: "Part des 20-30 ans vivant en colocation : 2015 : 12% ; 2020 : 18% ; 2025 : 26%.",
      dadosGrafico: { labels: ["2015", "2020", "2025"], valores: [12, 18, 26], unidade: "% des 20-30 ans en colocation" },
      permiteDownload: false }
  ]
},
{
  titulo: "Section B : l'impact des réseaux sociaux sur les relations humaines",
  exame: "TEF", nivel: "B2", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Dissertação de nível B2 sobre tecnologia e relações sociais, típica da Section B do TEF.",
  objetivos: ["Analisar impactos positivos e negativos de uma tecnologia social", "Utilizar exemplos concretos do cotidiano", "Construir uma conclusão equilibrada"],
  instrucoes: "Les réseaux sociaux ont profondément transformé notre manière de communiquer. Selon vous, ont-ils un effet plutôt positif ou négatif sur les relations humaines ? Justifiez votre réponse avec des arguments précis. (220 mots environ)",
  criteriosResumo: ["Análise de impactos", "Exemplos concretos", "Conclusão equilibrada"],
  tempoSugerido: 55, limitePalavrasMin: 200, limitePalavrasMax: 250, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação sobre tecnologia social", "Vocabulário de comunicação digital", "Registro formal"],
  coletanea: [
    { tipo: "artigo", titulo: "Connectés mais plus seuls ?", fonte: "Revue Psychologie Sociale (fictive)", autor: "Dr. M. Anselme", data: "2025", conteudo: "Si les réseaux sociaux permettent de rester en contact avec des proches éloignés, plusieurs études pointent aussi une corrélation entre usage intensif et sentiment de solitude, notamment chez les adolescents. Les chercheurs insistent sur l'importance de distinguer les interactions superficielles des échanges réellement significatifs.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« Tout dépend de la façon dont on les utilise »", fonte: "Podcast Société Connectée (fictif)", autor: "Propos recueillis par J. Petit", data: "2025", conteudo: "— Les réseaux sociaux nuisent-ils aux relations humaines ? — Ce n'est pas l'outil en lui-même qui pose problème, mais l'usage qu'on en fait. Utilisés pour organiser des rencontres réelles, ils renforcent les liens. Utilisés comme substitut à la vie sociale, ils peuvent effectivement l'appauvrir.", permiteDownload: false }
  ]
},
{
  titulo: "Section B : faut-il consommer local ?",
  exame: "TEF", nivel: "B2", tipoProducao: "Essai argumentatif", dificuldade: "medio",
  descricao: "Dissertação sobre consumo local e sustentabilidade, mobilizando dados econômicos e ambientais.",
  objetivos: ["Discutir escolhas de consumo com base em dados", "Considerar dimensões econômica, ambiental e social", "Formular uma recomendação pessoal"],
  instrucoes: "De nombreuses campagnes encouragent la consommation de produits locaux. Cette pratique est-elle vraiment bénéfique pour l'environnement et l'économie ? Développez votre opinion avec des arguments précis. (220 mots environ)",
  criteriosResumo: ["Uso de dados", "Múltiplas dimensões (economia/ambiente)", "Recomendação pessoal"],
  tempoSugerido: 55, limitePalavrasMin: 200, limitePalavrasMax: 250, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação econômico-ambiental", "Vocabulário de consumo sustentável", "Uso de dados na argumentação"],
  coletanea: [
    { tipo: "artigo", titulo: "Consommer local : effet de mode ou vraie solution ?", fonte: "Revue Économie Durable (fictive)", autor: "H. Lacombe", data: "2025", conteudo: "Acheter local permet de soutenir les producteurs de sa région et de réduire certaines émissions liées au transport. Cependant, des experts rappellent que l'impact environnemental dépend aussi du mode de production : un produit local cultivé sous serre chauffée peut parfois avoir une empreinte carbone supérieure à un produit importé de saison.", permiteDownload: false },
    { tipo: "estatistica", titulo: "Consommation de produits locaux", fonte: "Baromètre de consommation fictif", autor: "", data: "2025",
      conteudo: "Évolution du budget alimentaire consacré aux produits locaux : 2018 : 14% ; 2021 : 19% ; 2024 : 23%.",
      dadosGrafico: { labels: ["2018", "2021", "2024"], valores: [14, 19, 23], unidade: "% du budget alimentaire" },
      permiteDownload: false }
  ]
},
{
  titulo: "Section A : lettre de motivation pour un poste bénévole",
  exame: "TEF", nivel: "B1", tipoProducao: "Lettre de motivation", dificuldade: "medio",
  descricao: "Redação de uma carta de motivação para trabalho voluntário, treinando estrutura formal e autoapresentação.",
  objetivos: ["Estruturar uma carta de motivação (apresentação, motivação, encerramento)", "Destacar qualidades pessoais relevantes", "Manter um registro formal e positivo"],
  instrucoes: "Une association humanitaire recherche des bénévoles pour un projet d'aide aux personnes âgées. Écrivez une lettre de motivation expliquant pourquoi vous souhaitez participer et quelles qualités vous pouvez apporter. (150 mots environ)",
  criteriosResumo: ["Estrutura da carta", "Qualidades destacadas", "Registro formal positivo"],
  tempoSugerido: 35, limitePalavrasMin: 130, limitePalavrasMax: 170, creditosNecessarios: 1,
  competenciasAvaliadas: ["Carta de motivação", "Autoapresentação", "Vocabulário de voluntariado"],
  coletanea: [
    { tipo: "documento_oficial", titulo: "Appel à bénévoles — Association Solidarité Seniors (fictive)", fonte: "Association fictive", autor: "", data: "2025", conteudo: "Notre association recherche des bénévoles disponibles quelques heures par semaine pour rendre visite à des personnes âgées isolées. Aucune expérience préalable n'est requise, seulement de la patience, de l'écoute et un engagement régulier.", permiteDownload: false }
  ]
},
{
  titulo: "Section B : l'école doit-elle plus valoriser l'art et la musique ?",
  exame: "TEF", nivel: "C1", tipoProducao: "Essai argumentatif", dificuldade: "dificil",
  descricao: "Tarefa longa de nível avançado sobre educação artística, exigindo argumentação madura.",
  objetivos: ["Defender a importância de disciplinas frequentemente marginalizadas", "Articular argumentos pedagógicos e sociais", "Utilizar um registro formal sofisticado"],
  instrucoes: "Dans de nombreux systèmes scolaires, les matières artistiques occupent une place secondaire par rapport aux matières scientifiques. Cette hiérarchie est-elle justifiée ? Développez une argumentation nuancée. (220 mots environ)",
  criteriosResumo: ["Defesa argumentativa madura", "Múltiplos argumentos pedagógicos", "Registro sofisticado"],
  tempoSugerido: 55, limitePalavrasMin: 200, limitePalavrasMax: 250, creditosNecessarios: 2,
  competenciasAvaliadas: ["Argumentação educacional avançada", "Vocabulário artístico e pedagógico", "Registro formal elaborado"],
  coletanea: [
    { tipo: "artigo", titulo: "L'art à l'école, un luxe ou une nécessité ?", fonte: "Revue Pédagogie Contemporaine (fictive)", autor: "F. Berthier", data: "2025", conteudo: "Dans un contexte de restrictions budgétaires, les heures dédiées aux arts plastiques et à la musique sont souvent les premières réduites dans les établissements scolaires. Pourtant, plusieurs recherches en pédagogie associent la pratique artistique régulière au développement de la créativité, de la confiance en soi et même à de meilleurs résultats dans d'autres matières.", permiteDownload: false },
    { tipo: "entrevista", titulo: "« La créativité s'apprend comme le calcul »", fonte: "Revue Éducation & Société (fictive)", autor: "Propos recueillis par N. Aubert", data: "2025", conteudo: "— Pourquoi défendez-vous une place plus importante pour les arts à l'école ? — Parce que la créativité n'est pas un don inné réservé à quelques-uns : elle s'entraîne, comme n'importe quelle compétence. En la reléguant au second plan, on prive de nombreux élèves d'un langage d'expression essentiel à leur développement personnel.", permiteDownload: false }
  ]
}

];

module.exports = { TEMAS, RUBRICAS, CRITERIOS_PADRAO };

// Executa apenas quando chamado diretamente: `node backend/seed/temas.js`
if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.MONGO_URI);

    for (const r of RUBRICAS) {
      await Rubrica.findOneAndUpdate({ exame: r.exame }, r, { upsert: true });
    }
    console.log(`Rubricas ok (${RUBRICAS.length}).`);

    let criados = 0, existentes = 0;
    for (const t of TEMAS) {
      const jaExiste = await Tema.findOne({ titulo: t.titulo });
      if (jaExiste) { existentes++; continue; }
      await Tema.create(t);
      criados++;
    }
    console.log(`Temas criados: ${criados}. Já existentes (ignorados): ${existentes}. Total no arquivo: ${TEMAS.length}.`);

    await mongoose.disconnect();
  })().catch(err => { console.error(err); process.exit(1); });
}
