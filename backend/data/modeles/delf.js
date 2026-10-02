// Ambiente de Produção no formato do DELF (A1, A2, B1, B2): tâches de cada nível, trames,
// eixos temáticos e sujets originais. O app usa os mesmos "lugares" de tâche do TCF
// (T1, T2, T3 = oral; ET1, ET2, ET3 = escrita), cada um com o seu formato de modelo:
//   T1 = resposta em etapas · T2 = diálogo (perguntas do candidato) · T3 = monólogo em etapas
//   ET1/ET2 = texto curto · ET3 = texto argumentado.
// Cada nível usa só os lugares que correspondem às partes da sua prova (ver `taches`).

const C = ["#94C4EC", "#E4C043", "#8FBFA9", "#C9A62E", "#7FB0DC", "#D51E28", "#B9A3D6"];
const etapas = l => l.map(([rotulo, texte], i) => ({ rotulo, cor: C[i % C.length], texte }));

const NIVEAUX = ["A1", "A2", "B1", "B2"];

// Eixos do DELF por nível (as chaves são as do eixos.json do Ambiente de Produção).
// A1/A2: vida cotidiana, pessoal e próxima. B1/B2: temas de sociedade, cada vez mais abstratos.
const EIXOS = {
  A1: ["fam", "loisirs", "alim", "log", "ville", "transports", "voyages", "conso", "sante", "sport", "trav", "edu", "relations"],
  A2: ["fam", "relations", "loisirs", "alim", "log", "ville", "transports", "voyages", "conso", "sante", "sport", "trav", "edu", "culture"],
  B1: ["edu", "trav", "tech", "medias", "env", "sante", "alim", "sport", "loisirs", "voyages", "culture", "fam", "relations", "ville", "transports", "conso", "log"],
  B2: ["soc", "env", "tech", "medias", "edu", "trav", "sante", "culture", "conso", "ville", "transports", "alim", "sport", "mondial", "relations"]
};

// Partes de cada nível. `ordem`: ordem oficial da prova. `fases`: cronômetro do oral
// (preparação + passagem). `epreuve`: épreuve escrita completa (min) e etapas aconselhadas.
const NIVEIS = {
  A1: {
    nome: "DELF A1",
    taches: {
      ET1: { nom: "Exercice 2", sous: "Message simple", info: "40 à 50 mots · carte postale, courriel", min: 40, max: 60, minutos: 20 },
      T1: { nom: "Partie 1", sous: "Entretien dirigé", info: "≈ 1 min · sans préparation", palavras: [60, 90], fases: [{ nome: "Entretien dirigé", seg: 60 }] },
      T2: { nom: "Partie 2", sous: "Échange d'informations", info: "≈ 2 min · préparation commune aux parties 2 et 3", palavras: [50, 90], fases: [{ nome: "Préparation", seg: 300 }, { nome: "Échange d'informations", seg: 120 }] },
      T3: { nom: "Partie 3", sous: "Dialogue simulé", info: "≈ 2 min · préparation commune aux parties 2 et 3", palavras: [60, 100], fases: [{ nome: "Préparation", seg: 300 }, { nome: "Dialogue simulé", seg: 120 }] }
    },
    ordem: ["T1", "T2", "T3", "ET1"],
    epreuve: { min: 25, etapas: [{ t: "Exercice 2", min: 20 }, { t: "Relecture", min: 5 }] },
    descricao: "Produção escrita (30 min, 25 pts): um formulário e uma mensagem simples. Produção oral (5 a 7 min, 25 pts): entretien dirigé, échange d'informations e dialogue simulé. O formulário fica na Simulação Completa."
  },
  A2: {
    nome: "DELF A2",
    taches: {
      ET1: { nom: "Exercice 1", sous: "Raconter un événement ou une expérience", info: "60 à 80 mots · ≈ 20 min", min: 60, max: 90, minutos: 20 },
      ET2: { nom: "Exercice 2", sous: "Lettre ou message (inviter, remercier, s'excuser…)", info: "60 à 80 mots · ≈ 20 min", min: 60, max: 90, minutos: 20 },
      T1: { nom: "Partie 1", sous: "Entretien dirigé", info: "≈ 1 min 30 · sans préparation", palavras: [120, 160], fases: [{ nome: "Entretien dirigé", seg: 90 }] },
      T3: { nom: "Partie 2", sous: "Monologue suivi", info: "≈ 2 min · préparation commune aux parties 2 et 3", palavras: [180, 230], fases: [{ nome: "Préparation", seg: 300 }, { nome: "Monologue suivi", seg: 120 }] },
      T2: { nom: "Partie 3", sous: "Exercice en interaction", info: "3 à 4 min · préparation commune aux parties 2 et 3", palavras: [150, 220], fases: [{ nome: "Préparation", seg: 300 }, { nome: "Exercice en interaction", seg: 210 }] }
    },
    ordem: ["T1", "T3", "T2", "ET1", "ET2"],
    epreuve: { min: 45, etapas: [{ t: "Exercice 1", min: 20 }, { t: "Exercice 2", min: 20 }, { t: "Relecture", min: 5 }] },
    descricao: "Produção escrita (45 min, 25 pts): dois textos de 60 a 80 palavras. Produção oral (6 a 8 min, 25 pts): entretien dirigé, monologue suivi e exercice en interaction."
  },
  B1: {
    nome: "DELF B1",
    taches: {
      ET3: { nom: "Exercice 1", selo: "1", sous: "Essai, article ou courrier : donner son opinion", info: "160 mots minimum · 45 min", min: 160, max: 230, minutos: 40 },
      T1: { nom: "Partie 1", sous: "Entretien dirigé", info: "2 à 3 min · sans préparation", palavras: [200, 280], fases: [{ nome: "Entretien dirigé", seg: 180 }] },
      T2: { nom: "Partie 2", sous: "Exercice en interaction", info: "3 à 4 min · sans préparation", palavras: [250, 350], fases: [{ nome: "Exercice en interaction", seg: 240 }] },
      T3: { nom: "Partie 3", sous: "Expression d'un point de vue", info: "5 à 7 min · 10 min de préparation", palavras: [350, 450], fases: [{ nome: "Préparation", seg: 600 }, { nome: "Point de vue et échange", seg: 420 }] }
    },
    ordem: ["T1", "T2", "T3", "ET3"],
    epreuve: { min: 45, etapas: [{ t: "Rédaction", min: 40 }, { t: "Relecture", min: 5 }] },
    descricao: "Produção escrita (45 min, 25 pts): um ensaio, artigo ou carta de no mínimo 160 palavras. Produção oral (≈ 15 min, 25 pts): entretien dirigé, exercice en interaction e expression d'un point de vue a partir de um documento."
  },
  B2: {
    nome: "DELF B2",
    taches: {
      ET3: { nom: "Exercice 1", selo: "1", sous: "Texte argumenté (lettre formelle, article, contribution)", info: "250 mots minimum · 1 h", min: 250, max: 340, minutos: 50 },
      T3: { nom: "Épreuve orale", selo: "1", sous: "Exposé et débat à partir d'un document", info: "30 min de préparation · 20 min de passation", palavras: [600, 750], fases: [{ nome: "Préparation", seg: 1800 }, { nome: "Exposé", seg: 420 }, { nome: "Débat avec l'examinateur", seg: 780 }] }
    },
    ordem: ["T3", "ET3"],
    epreuve: { min: 60, etapas: [{ t: "Rédaction", min: 50 }, { t: "Relecture", min: 10 }] },
    descricao: "Produção escrita (1 h, 25 pts): um texto argumentativo de no mínimo 250 palavras. Produção oral (20 min + 30 min de preparação, 25 pts): exposé a partir de um documento déclencheur, seguido de debate."
  }
};

// Trames Français na Mira do DELF, por nível e tâche.
const TRAMES = {
  A1: {
    ET1: { titulo: "Message simple : la trame", sousTitre: "40 à 50 mots : carte postale, courriel ou message à un(e) ami(e).", etapes: etapas([
      ["Salutation", "Salut [prénom] ! / Bonjour [prénom],"],
      ["Pourquoi j'écris", "Je suis à [lieu] avec [qui]. / Je t'écris pour [t'inviter / te raconter / te demander]…"],
      ["Informations", "Il fait [beau / chaud]. L'hôtel est [adjectif]. Le matin, je [activité]. / C'est le [jour] à [heure], à [lieu]."],
      ["Question ou proposition", "Tu veux venir ? / Et toi, ça va ? / Tu es libre samedi ?"],
      ["Formule de fin", "À bientôt ! Bisous, [prénom] / Grosses bises,"]]),
      conseil: "Phrases courtes au présent. Répondez à TOUS les points de la consigne et comptez vos mots (40 à 50)." },
    T1: { titulo: "Entretien dirigé : la trame", sousTitre: "≈ 1 min, sans préparation : l'examinateur vous pose des questions simples sur vous.", etapes: etapas([
      ["Saluer", "Bonjour Madame / Monsieur."],
      ["Répondre", "Je m'appelle… J'ai … ans. Je suis [nationalité]. J'habite à…"],
      ["Ajouter un détail", "J'aime… parce que c'est [adjectif]. / Je travaille à… / J'étudie…"],
      ["Compléter", "Le week-end, je… avec… / Ma famille, c'est…"]]),
      conseil: "Répondez par des phrases complètes, pas seulement « oui » ou « non ». Ajoutez toujours un petit détail." },
    T2: { titulo: "Échange d'informations : la trame", sousTitre: "≈ 2 min : posez des questions à l'examinateur à partir des mots des cartes.", etapes: etapas([
      ["Commencer", "Bonjour ! J'ai quelques questions pour vous."],
      ["Question fermée", "Vous avez des frères et sœurs ? / Est-ce que vous aimez le cinéma ?"],
      ["Question ouverte", "Où habitez-vous ? / Quand… ? / Qu'est-ce que vous faites le week-end ? / Quel est votre plat préféré ?"],
      ["Réagir", "Ah, d'accord ! / C'est super ! / Moi aussi !"],
      ["Remercier", "Merci beaucoup !"]]),
      conseil: "Une carte = une question. Variez : « Est-ce que… ? », « Où… ? », « Quand… ? », « Qu'est-ce que… ? », « Quel(le)… ? »." },
    T3: { titulo: "Dialogue simulé : la trame", sousTitre: "≈ 2 min : un jeu de rôle (magasin, gare, restaurant…). L'examinateur est le vendeur ou l'employé.", etapes: etapas([
      ["Saluer", "Bonjour Madame / Monsieur."],
      ["Demander", "Je voudrais…, s'il vous plaît. / Vous avez… ?"],
      ["Se renseigner", "C'est combien ? / Quelle taille ? / À quelle heure… ? / C'est où ?"],
      ["Payer", "Je peux payer par carte ? / Voilà, merci."],
      ["Prendre congé", "Merci, bonne journée ! Au revoir."]]),
      conseil: "Politesse obligatoire : « s'il vous plaît », « merci ». Utilisez « je voudrais » pour demander." }
  },
  A2: {
    ET1: { titulo: "Raconter un événement : la trame", sousTitre: "60 à 80 mots : raconter une expérience passée et donner ses impressions.", etapes: etapas([
      ["Situer", "Le week-end dernier / Samedi dernier, je suis allé(e) à… avec…"],
      ["Raconter (passé composé)", "D'abord, nous avons… Ensuite, … Après, … Enfin, …"],
      ["Décrire (imparfait)", "Il faisait beau. Il y avait beaucoup de monde. C'était [adjectif]."],
      ["Impressions", "J'ai beaucoup aimé… parce que… / J'ai trouvé ça [génial / un peu long]."],
      ["Conclure", "C'était une journée inoubliable ! J'espère y retourner bientôt."]]),
      conseil: "Passé composé pour les actions, imparfait pour les descriptions. N'oubliez pas vos impressions (le barème les demande)." },
    ET2: { titulo: "Lettre ou message : la trame", sousTitre: "60 à 80 mots : inviter, remercier, s'excuser, demander, informer, féliciter.", etapes: etapas([
      ["Formule d'appel", "Cher Paul, / Chère Julie, / Madame, Monsieur,"],
      ["Objet", "Je t'écris pour te remercier de… / pour m'excuser de… / pour t'inviter à…"],
      ["Détails", "En effet, … / Je ne peux pas venir parce que… / La fête aura lieu le… à…"],
      ["Proposition ou demande", "Est-ce qu'on pourrait… ? / Peux-tu me répondre avant le… ?"],
      ["Formule de fin", "Amitiés, / Je t'embrasse, / Cordialement, [prénom]"]]),
      conseil: "Adaptez le registre : « tu » avec un ami, « vous » avec un voisin, une école, une entreprise." },
    T1: { titulo: "Entretien dirigé : la trame", sousTitre: "≈ 1 min 30, sans préparation : présent, passé composé et futur proche.", etapes: etapas([
      ["Se présenter", "Je m'appelle… J'ai … ans. Je viens de… et j'habite à…"],
      ["Habitudes (présent)", "Je travaille comme… / J'étudie… Le week-end, en général, je…"],
      ["Raconter (passé)", "L'année dernière, j'ai… / Le week-end dernier, je suis allé(e)…"],
      ["Projets (futur proche)", "L'année prochaine, je vais… / J'aimerais…"]]),
      conseil: "Montrez que vous savez utiliser plusieurs temps : présent, passé composé, futur proche." },
    T3: { titulo: "Monologue suivi : la trame", sousTitre: "≈ 2 min : parlez d'un sujet de la vie quotidienne, sans être interrompu(e).", etapes: etapas([
      ["Introduction", "Je vais vous parler de…"],
      ["Décrire", "D'habitude, je… / Dans mon pays, on…"],
      ["Exemple", "Par exemple, l'été dernier, je…"],
      ["Opinion", "J'aime ça parce que… / Ce que je préfère, c'est…"],
      ["Conclusion", "Pour conclure, … / Voilà pourquoi…"]]),
      conseil: "Préparez 3 ou 4 idées avec des connecteurs simples : d'abord, ensuite, par exemple, parce que, enfin." },
    T2: { titulo: "Exercice en interaction : la trame", sousTitre: "3 à 4 min : une situation de la vie quotidienne (achat, réclamation, réservation, organisation).", etapes: etapas([
      ["Saluer et présenter le besoin", "Bonjour, je voudrais des renseignements sur… / J'ai un problème avec…"],
      ["Expliquer", "J'ai acheté… mais… / Je cherche… pour…"],
      ["Poser des questions", "Quel est le prix ? / Est-ce qu'il est possible de… ? / C'est ouvert quand ?"],
      ["Réagir et négocier", "Ah, c'est un peu cher… Vous n'avez pas… ? / Je préférerais…"],
      ["Conclure", "D'accord, je prends… / Parfait. Merci beaucoup, au revoir !"]]),
      conseil: "Jouez vraiment le rôle : saluez, expliquez, posez des questions, réagissez aux réponses et concluez poliment." }
  },
  B1: {
    ET3: { titulo: "Essai, article ou courrier : la trame", sousTitre: "160 mots minimum : exprimer et justifier son opinion sur un sujet général.", etapes: etapas([
      ["Formule d'appel", "Madame, Monsieur, / Chers lecteurs, / Salut à tous,"],
      ["Introduction", "Je vous écris au sujet de… / On entend souvent dire que…"],
      ["Opinion", "À mon avis, … / Je suis convaincu(e) que…"],
      ["Arguments et exemples", "Tout d'abord, … Par exemple, … De plus, … En effet, …"],
      ["Nuance", "Cependant, il faut reconnaître que…"],
      ["Conclusion", "En conclusion, … C'est pourquoi je pense que…"],
      ["Formule de fin", "Je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées. / Cordialement,"]]),
      conseil: "Donnez un avis clair, deux ou trois arguments avec des exemples personnels, et respectez le type de texte (lettre, article, message de forum)." },
    T1: { titulo: "Entretien dirigé : la trame", sousTitre: "2 à 3 min, sans préparation : parlez de vous, de votre parcours, de vos intérêts et de vos projets.", etapes: etapas([
      ["Présentation", "Je m'appelle…, j'ai … ans et je viens de…"],
      ["Parcours", "J'ai fait des études de… Actuellement, je travaille / j'étudie…"],
      ["Centres d'intérêt", "Ce qui me passionne, c'est… parce que…"],
      ["Projets", "Dans quelques années, j'aimerais… C'est pour ça que j'apprends le français."]]),
      conseil: "Développez vos réponses : une idée, une raison, un exemple." },
    T2: { titulo: "Exercice en interaction : la trame", sousTitre: "3 à 4 min, sans préparation : convaincre, négocier ou résoudre un conflit.", etapes: etapas([
      ["Engager", "Écoute, il faut que je te parle de… / Excusez-moi, j'ai un problème avec…"],
      ["Exposer son point de vue", "Je voudrais vraiment… parce que…"],
      ["Argumenter", "Tu sais, … En plus, … D'ailleurs, …"],
      ["Réagir aux objections", "Je comprends, mais… / Tu as raison, cependant…"],
      ["Proposer un compromis", "Et si on… ? / Je te propose de…"],
      ["Conclure", "Alors, on est d'accord ? / Très bien, merci de votre compréhension."]]),
      conseil: "Ne restez pas sur un « non » : argumentez, écoutez l'autre et proposez une solution." },
    T3: { titulo: "Expression d'un point de vue : la trame", sousTitre: "5 à 7 min après 10 min de préparation : un document déclencheur, puis votre opinion.", etapes: etapas([
      ["Présenter le document", "Ce document, intitulé « … », traite de…"],
      ["Dégager le problème", "La question que pose ce document est la suivante : …"],
      ["Opinion", "Personnellement, je pense que…"],
      ["Arguments et exemples", "D'abord, … Par exemple, dans mon pays, … Ensuite, …"],
      ["Nuance", "Néanmoins, …"],
      ["Conclusion", "En conclusion, … / Pour finir, je dirais que…"]]),
      conseil: "Ne résumez pas le document : dégagez le problème et donnez VOTRE avis, avec des exemples." }
  },
  B2: {
    ET3: { titulo: "Texte argumenté : la trame", sousTitre: "250 mots minimum : lettre formelle, article ou contribution à un débat.", etapes: etapas([
      ["Formule d'appel ou titre", "Madame, Monsieur, / [Titre de l'article]"],
      ["Introduction", "Contexte + problématique : « Alors que…, la question de… suscite aujourd'hui de vives discussions. »"],
      ["Thèse", "Arguments + exemples : « D'une part, … En effet, … C'est notamment le cas de… »"],
      ["Concession", "« Certes, … Toutefois, … / Il n'en reste pas moins que… »"],
      ["Propositions", "« Il conviendrait de… / Pourquoi ne pas… ? »"],
      ["Conclusion", "Bilan + ouverture : « En définitive, … »"],
      ["Formule de fin", "Dans l'attente de votre réponse, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées."]]),
      conseil: "Le barème valorise la cohérence de l'argumentation : un plan clair, des connecteurs logiques variés et des exemples précis." },
    T3: { titulo: "Exposé et débat : la trame", sousTitre: "30 min de préparation, puis 5 à 7 min d'exposé et 10 à 13 min de débat avec l'examinateur.", etapes: etapas([
      ["Introduction", "Présenter le document : « Le document, extrait de…, aborde la question de… »"],
      ["Problématique", "« On peut donc se demander si… »"],
      ["Annonce du plan", "« Dans un premier temps, j'évoquerai…, puis j'expliquerai… »"],
      ["Première partie", "Arguments + exemples précis (pays d'origine, actualité, expérience)."],
      ["Deuxième partie", "Limites, contre-arguments ou solutions."],
      ["Conclusion", "Bilan + ouverture : « Pour conclure, … Reste à savoir si… »"],
      ["Débat", "« Je comprends votre point de vue, mais… / C'est une bonne question : à mon sens… »"]]),
      conseil: "L'exposé doit être organisé (introduction, plan, conclusion). Au débat, défendez votre position et nuancez-la." }
  }
};

// Sujets (originais). Formato: [eixo, consigne]; os de B1/B2 T3 trazem o documento déclencheur na consigne.
const S = {
  A1: {
    ET1: [
      ["voyages", "Vous êtes en vacances à la mer. Vous écrivez une carte postale à un(e) ami(e) français(e). Vous parlez du temps, de l'hôtel et de vos activités."],
      ["loisirs", "Vous invitez votre amie Julie au cinéma samedi. Vous lui écrivez un courriel : vous donnez le jour, l'heure, le lieu et le titre du film."],
      ["fam", "Vous écrivez à votre correspondant(e) pour présenter votre famille : les prénoms, l'âge, le travail et les goûts de chaque personne."],
      ["log", "Vous avez un nouvel appartement. Vous écrivez un message à un(e) ami(e) pour le décrire (les pièces, le quartier) et vous l'invitez à venir le voir."],
      ["alim", "Vous organisez un pique-nique dimanche avec des collègues. Vous écrivez un message : vous indiquez le lieu, l'heure et ce que chacun doit apporter."],
      ["ville", "Vous habitez dans une nouvelle ville. Vous écrivez un courriel à votre professeur(e) de français pour présenter la ville : ce que vous aimez, ce qu'il y a à faire."],
      ["transports", "Vous allez rendre visite à un(e) ami(e). Vous lui écrivez pour dire comment vous arrivez (train, bus, avion), le jour et l'heure de votre arrivée."],
      ["conso", "Vous avez acheté un cadeau pour l'anniversaire de votre sœur. Vous écrivez un message à un(e) ami(e) pour décrire le cadeau, le magasin et le prix."],
      ["sante", "Vous êtes malade et vous ne pouvez pas aller au cours de français demain. Vous écrivez un message à votre professeur(e) : vous expliquez et vous vous excusez."],
      ["sport", "Vous faites du sport dans un club. Vous écrivez un message à un(e) ami(e) pour l'inviter à venir avec vous : quel sport, quand, où et combien ça coûte."],
      ["trav", "Vous commencez un nouveau travail. Vous écrivez à un(e) ami(e) pour raconter votre première journée : le lieu, les collègues, les horaires."],
      ["edu", "Vous suivez un cours de français. Vous écrivez un message à un(e) ami(e) pour présenter votre école, votre professeur(e) et vos camarades."],
      ["relations", "C'est l'anniversaire de votre ami Paul samedi. Vous écrivez un message à vos amis pour organiser une fête surprise : la date, le lieu, l'heure et le cadeau."],
      ["voyages", "Vous passez le week-end à Paris. Vous écrivez un message à votre famille : vous décrivez votre hôtel et ce que vous avez visité."]
    ],
    T1: [
      ["fam", "Présentez-vous : comment vous appelez-vous ? Quel âge avez-vous ? Où habitez-vous ?"],
      ["fam", "Parlez de votre famille : vous avez des frères et sœurs ? Comment s'appellent-ils ? Qu'est-ce qu'ils font ?"],
      ["trav", "Qu'est-ce que vous faites dans la vie ? Où travaillez-vous ou étudiez-vous ?"],
      ["loisirs", "Qu'est-ce que vous aimez faire le week-end ?"],
      ["alim", "Quel est votre plat préféré ? Est-ce que vous aimez cuisiner ?"],
      ["log", "Décrivez votre maison ou votre appartement."],
      ["ville", "Comment est votre ville ou votre quartier ? Qu'est-ce que vous aimez dans votre ville ?"],
      ["transports", "Comment allez-vous au travail ou à l'école ? Combien de temps dure le trajet ?"],
      ["sport", "Vous faites du sport ? Quel sport, où et quand ?"],
      ["voyages", "Vous aimez voyager ? Quel pays voulez-vous visiter ? Pourquoi ?"],
      ["edu", "Pourquoi apprenez-vous le français ? Depuis quand ?"],
      ["relations", "Parlez de votre meilleur(e) ami(e) : comment s'appelle-t-il / elle ? Qu'est-ce que vous faites ensemble ?"]
    ],
    T2: [
      ["fam", "Thème : la famille. Posez des questions à l'examinateur à partir des mots : frères ? / enfants ? / parents ? / âge ? / anniversaire ? / vacances en famille ?"],
      ["loisirs", "Thème : les loisirs. Posez des questions à l'examinateur à partir des mots : cinéma ? / musique ? / livre ? / week-end ? / télévision ? / sortir le soir ?"],
      ["alim", "Thème : les repas. Posez des questions à l'examinateur à partir des mots : petit-déjeuner ? / restaurant ? / plat préféré ? / boisson ? / cuisiner ? / marché ?"],
      ["log", "Thème : le logement. Posez des questions à l'examinateur à partir des mots : maison ? / quartier ? / chambre ? / jardin ? / voisins ? / animaux ?"],
      ["trav", "Thème : le travail. Posez des questions à l'examinateur à partir des mots : métier ? / horaires ? / collègues ? / transport ? / déjeuner ? / vacances ?"],
      ["voyages", "Thème : les vacances. Posez des questions à l'examinateur à partir des mots : pays ? / été ? / hôtel ? / plage ? / photos ? / avion ?"],
      ["ville", "Thème : la ville. Posez des questions à l'examinateur à partir des mots : habiter ? / parc ? / magasins ? / musée ? / bus ? / quartier préféré ?"],
      ["sport", "Thème : le sport. Posez des questions à l'examinateur à partir des mots : sport préféré ? / club ? / match ? / piscine ? / vélo ? / dimanche ?"],
      ["conso", "Thème : les achats. Posez des questions à l'examinateur à partir des mots : vêtements ? / supermarché ? / Internet ? / cadeau ? / prix ? / couleur préférée ?"],
      ["edu", "Thème : les études. Posez des questions à l'examinateur à partir des mots : école ? / langues ? / professeur ? / matière préférée ? / examen ? / bibliothèque ?"]
    ],
    T3: [
      ["conso", "Vous êtes dans une boulangerie. Vous achetez du pain et des gâteaux pour un anniversaire. Vous demandez les prix et vous payez. L'examinateur joue le rôle du vendeur."],
      ["conso", "Vous voulez acheter un pull dans un magasin de vêtements. Vous demandez la taille, la couleur et le prix. L'examinateur joue le rôle du vendeur."],
      ["voyages", "Vous êtes à l'office de tourisme. Vous demandez un plan de la ville, les horaires du musée et le prix d'une visite. L'examinateur joue le rôle de l'employé(e)."],
      ["transports", "Vous êtes à la gare. Vous achetez un billet aller-retour pour Lyon. Vous demandez l'heure du départ, le quai et le prix. L'examinateur joue le rôle de l'employé(e)."],
      ["alim", "Vous êtes au marché. Vous achetez des fruits et des légumes pour un repas. Vous demandez les prix et vous payez. L'examinateur joue le rôle du marchand."],
      ["alim", "Vous êtes au restaurant. Vous commandez un repas (entrée, plat, boisson) et vous demandez l'addition. L'examinateur joue le rôle du serveur."],
      ["log", "Vous cherchez une chambre à louer. Vous téléphonez au propriétaire pour demander le prix, la taille de la chambre et le quartier. L'examinateur joue le rôle du propriétaire."],
      ["loisirs", "Vous voulez aller au cinéma. Vous achetez deux places : vous demandez les horaires, le prix et s'il y a une réduction pour les étudiants. L'examinateur joue le rôle du caissier."],
      ["sante", "Vous êtes à la pharmacie. Vous avez mal à la tête. Vous demandez un médicament, le prix et comment le prendre. L'examinateur joue le rôle du pharmacien."],
      ["sport", "Vous voulez vous inscrire à la piscine municipale. Vous demandez les horaires, le prix de l'abonnement et les documents nécessaires. L'examinateur joue le rôle de l'employé(e)."]
    ]
  },
  A2: {
    ET1: [
      ["voyages", "Vous avez passé un week-end dans une ville que vous ne connaissiez pas. Sur votre blog, vous racontez ce que vous avez fait et vous donnez vos impressions."],
      ["relations", "Vous êtes allé(e) au mariage d'un(e) ami(e). Vous écrivez à un(e) ami(e) français(e) pour raconter cette journée : le lieu, les invités, le repas, la fête."],
      ["trav", "Vous avez commencé un stage dans une entreprise. Vous écrivez à un(e) ami(e) pour raconter votre première semaine et dire ce que vous pensez de ce stage."],
      ["loisirs", "Vous avez assisté à un concert. Sur un forum, vous racontez la soirée et vous dites si vous avez aimé ou non."],
      ["log", "Vous avez déménagé. Vous écrivez à votre correspondant(e) pour raconter le déménagement et décrire votre nouveau logement."],
      ["fam", "Vous avez organisé une fête pour l'anniversaire de vos parents. Vous racontez cet événement sur votre journal en ligne."],
      ["edu", "Vous avez participé à une sortie scolaire ou à une journée de formation. Vous écrivez un petit article pour le journal de votre école ou de votre entreprise."],
      ["sport", "Vous avez participé à une course solidaire dans votre ville. Vous racontez cette expérience sur un réseau social : l'organisation, l'ambiance, vos impressions."],
      ["alim", "Vous avez suivi un cours de cuisine. Vous écrivez à un(e) ami(e) pour raconter ce que vous avez préparé et ce que vous avez appris."],
      ["transports", "Votre voyage en train a été très compliqué (retard, correspondance manquée…). Vous racontez cette mauvaise expérience à un(e) ami(e)."],
      ["culture", "Vous avez visité une exposition. Vous racontez votre visite sur votre blog et vous donnez votre avis."],
      ["ville", "Votre quartier a organisé une fête des voisins. Vous racontez cette journée à un(e) ami(e) qui habite loin."],
      ["sante", "Vous avez eu un petit accident : vous vous êtes fait mal au pied. Vous racontez à un(e) ami(e) ce qui s'est passé et comment vous allez."]
    ],
    ET2: [
      ["relations", "Votre ami(e) vous a invité(e) à son anniversaire, mais vous ne pouvez pas y aller. Vous lui écrivez pour vous excuser, expliquer pourquoi et proposer une autre date pour vous voir."],
      ["fam", "Vous avez passé une semaine chez la famille d'un(e) ami(e) français(e). Vous leur écrivez pour les remercier et dire ce que vous avez préféré pendant votre séjour."],
      ["loisirs", "Vous organisez une sortie au parc d'attractions avec des collègues. Vous écrivez un courriel pour les inviter : la date, le transport, le prix, ce qu'il faut apporter."],
      ["log", "Votre voisin fait souvent du bruit le soir. Vous lui écrivez un message poli pour expliquer le problème et proposer une solution."],
      ["trav", "Vous ne pouvez pas venir à une réunion de travail demain. Vous écrivez à votre responsable pour vous excuser, expliquer la raison et proposer une solution."],
      ["edu", "Vous voulez vous inscrire à un cours de français du soir. Vous écrivez à l'école pour demander des informations : les horaires, le prix, le niveau, le début des cours."],
      ["relations", "Votre ami(e) a réussi un examen important. Vous lui écrivez pour le / la féliciter et vous lui proposez de fêter ça ensemble."],
      ["voyages", "Un(e) ami(e) vient vous rendre visite dans votre ville. Vous lui écrivez pour lui proposer un programme pour le week-end."],
      ["conso", "Vous avez acheté un appareil sur Internet et il ne fonctionne pas. Vous écrivez au service client pour expliquer le problème et demander un remboursement ou un échange."],
      ["sport", "Vous voulez vous inscrire dans un club de sport. Vous écrivez au club pour vous présenter et demander des renseignements."],
      ["alim", "Vous organisez un repas avec les voisins de votre immeuble pour faire connaissance. Vous écrivez l'invitation qui sera affichée dans le hall."],
      ["sante", "Votre collègue est malade depuis une semaine. Vous lui écrivez pour prendre de ses nouvelles et lui raconter ce qui se passe au travail."]
    ],
    T1: [
      ["fam", "Présentez-vous et parlez de votre famille."],
      ["trav", "Parlez de votre travail ou de vos études : qu'est-ce que vous faites et qu'est-ce que vous aimez ?"],
      ["loisirs", "Que faites-vous pendant votre temps libre ? Qu'avez-vous fait le week-end dernier ?"],
      ["voyages", "Parlez de vos dernières vacances : où êtes-vous allé(e) et avec qui ?"],
      ["edu", "Pourquoi apprenez-vous le français ? Comment l'apprenez-vous ?"],
      ["ville", "Parlez de la ville où vous habitez : qu'est-ce qu'on peut y faire ?"],
      ["alim", "Qu'est-ce que vous mangez habituellement ? Parlez d'un plat typique de votre pays."],
      ["log", "Décrivez votre logement et votre quartier. Vous aimeriez changer de logement ?"],
      ["relations", "Parlez de votre meilleur(e) ami(e) : comment vous êtes-vous rencontrés ?"],
      ["sport", "Quelle place a le sport dans votre vie ?"]
    ],
    T3: [
      ["loisirs", "Parlez de votre activité préférée : depuis quand la pratiquez-vous ? Pourquoi l'aimez-vous ?"],
      ["voyages", "Racontez un voyage qui vous a marqué(e) : où, quand, avec qui et ce que vous avez fait."],
      ["fam", "Parlez d'une fête de famille importante dans votre pays : comment la célébrez-vous ?"],
      ["alim", "Parlez de vos habitudes alimentaires : est-ce que vous cuisinez ? Où faites-vous vos courses ?"],
      ["ville", "Présentez un endroit de votre ville que vous aimez et expliquez pourquoi."],
      ["trav", "Décrivez une journée de travail ou d'études typique."],
      ["relations", "Parlez d'une personne qui est importante pour vous et expliquez pourquoi."],
      ["conso", "Où et comment faites-vous vos achats ? Préférez-vous les magasins ou Internet ? Pourquoi ?"],
      ["transports", "Quels moyens de transport utilisez-vous ? Lesquels préférez-vous et pourquoi ?"],
      ["sport", "Parlez d'un sport que vous pratiquez ou que vous aimez regarder."],
      ["culture", "Parlez d'un film, d'un livre ou d'une chanson que vous aimez beaucoup."],
      ["sante", "Que faites-vous pour rester en bonne santé ?"]
    ],
    T2: [
      ["voyages", "Vous êtes en vacances en France et vous voulez faire une excursion. Vous allez à l'office de tourisme pour vous renseigner (programme, prix, horaires, réservation). L'examinateur joue le rôle de l'employé(e)."],
      ["conso", "Vous avez acheté un pantalon, mais il est trop petit. Vous retournez au magasin pour l'échanger. L'examinateur joue le rôle du vendeur."],
      ["log", "Vous cherchez un appartement à louer. Vous visitez un appartement et vous posez des questions au propriétaire (loyer, charges, quartier, transports). L'examinateur joue le rôle du propriétaire."],
      ["loisirs", "Vous voulez organiser une sortie ce week-end avec un(e) ami(e) français(e). Vous discutez pour choisir l'activité, le lieu et l'heure. L'examinateur joue le rôle de l'ami(e)."],
      ["sante", "Vous êtes chez le médecin. Vous expliquez vos symptômes et vous posez des questions sur le traitement. L'examinateur joue le rôle du médecin."],
      ["transports", "Vous avez raté votre train. Vous allez au guichet pour changer votre billet. L'examinateur joue le rôle de l'employé(e)."],
      ["alim", "Vous voulez réserver une table au restaurant pour un anniversaire (12 personnes). Vous téléphonez pour vous renseigner sur le menu, les prix et la réservation. L'examinateur joue le rôle du restaurateur."],
      ["sport", "Vous voulez vous inscrire dans un club de sport. Vous posez des questions sur les activités, les horaires et les tarifs. L'examinateur joue le rôle de l'employé(e) du club."],
      ["edu", "Vous voulez vous inscrire à un cours de langue. Vous allez à l'accueil de l'école pour vous renseigner. L'examinateur joue le rôle de la secrétaire."],
      ["relations", "Un(e) ami(e) français(e) vous propose de partir en vacances ensemble. Vous discutez pour choisir la destination, le transport et le budget. L'examinateur joue le rôle de l'ami(e)."],
      ["trav", "Vous cherchez un petit travail pour l'été. Vous répondez à une annonce et vous posez des questions sur le poste (horaires, salaire, tâches). L'examinateur joue le rôle de l'employeur."],
      ["fam", "Vous organisez une fête pour l'anniversaire d'un(e) ami(e) avec son frère. Vous discutez de l'organisation (lieu, invités, cadeau, repas). L'examinateur joue le rôle du frère."]
    ]
  },
  B1: {
    ET3: [
      ["tech", "Sur un forum, un internaute écrit : « Les réseaux sociaux nous éloignent de nos vrais amis. » Vous répondez sur le forum pour donner votre opinion en vous appuyant sur des exemples précis."],
      ["edu", "Votre ville propose de remplacer les devoirs à la maison par des heures d'étude à l'école. Vous écrivez au journal local pour donner votre avis sur ce projet."],
      ["trav", "Le télétravail se développe dans votre entreprise. Dans le journal interne, vous écrivez un article pour présenter ses avantages et ses inconvénients et donner votre opinion."],
      ["env", "Votre mairie veut interdire les voitures dans le centre-ville le week-end. Vous écrivez au maire pour donner votre opinion sur ce projet."],
      ["sante", "Un magazine demande à ses lecteurs : « Faut-il interdire la vente de sodas dans les écoles ? » Vous écrivez au magazine pour donner votre avis."],
      ["medias", "Sur le blog d'un journal, on lit : « Aujourd'hui, les jeunes ne s'informent plus que par les réseaux sociaux. » Vous réagissez en donnant votre point de vue et des exemples."],
      ["voyages", "Un(e) ami(e) hésite entre partir en vacances à l'étranger et rester dans son pays. Vous lui écrivez pour lui donner votre avis et des conseils."],
      ["alim", "Votre entreprise veut fermer la cantine et donner des tickets-restaurant aux salariés. Vous écrivez au directeur pour donner votre opinion."],
      ["sport", "Sur un forum, on discute : « Les entreprises devraient proposer du sport à leurs salariés pendant les heures de travail. » Vous donnez votre opinion avec des exemples."],
      ["culture", "Votre ville veut réduire le budget de la bibliothèque municipale pour construire un parking. Vous écrivez au courrier des lecteurs du journal local pour réagir."],
      ["fam", "Un magazine pose la question : « Les enfants doivent-ils participer aux tâches ménagères ? » Vous écrivez un article pour donner votre point de vue."],
      ["ville", "Un(e) ami(e) vous demande s'il vaut mieux vivre à la campagne ou en ville. Vous lui répondez en donnant des arguments et des exemples."],
      ["conso", "Sur un forum de consommateurs, on lit : « Acheter d'occasion, c'est l'avenir. » Vous réagissez en expliquant votre opinion et vos expériences."],
      ["relations", "Un(e) ami(e) pense que l'on ne peut pas avoir de vrais amis sur Internet. Vous lui écrivez pour donner votre avis."],
      ["loisirs", "Le journal de votre ville demande : « Faut-il ouvrir les magasins et les musées le dimanche ? » Vous écrivez pour donner votre opinion."]
    ],
    T1: [
      ["fam", "Parlez-moi de vous : votre famille, votre parcours et vos projets."],
      ["trav", "Parlez de votre travail ou de vos études. Pourquoi avez-vous choisi ce domaine ?"],
      ["edu", "Pourquoi apprenez-vous le français ? Quels sont vos projets avec cette langue ?"],
      ["loisirs", "Comment occupez-vous votre temps libre ? Avez-vous une passion ?"],
      ["voyages", "Quel est le voyage le plus marquant que vous avez fait ? Pourquoi ?"],
      ["ville", "Parlez de l'endroit où vous vivez. Aimeriez-vous vivre ailleurs ? Pourquoi ?"],
      ["tech", "Quelle place les nouvelles technologies ont-elles dans votre vie quotidienne ?"],
      ["culture", "Quelles traditions de votre pays aimeriez-vous faire découvrir à des Français ?"],
      ["sante", "Que faites-vous pour garder un bon équilibre entre travail et vie personnelle ?"],
      ["relations", "Quelle est l'importance de l'amitié dans votre vie ?"]
    ],
    T2: [
      ["fam", "Vous voulez adopter un chien. Votre colocataire n'est pas d'accord. Vous essayez de le / la convaincre. L'examinateur joue le rôle du / de la colocataire."],
      ["trav", "Vous voulez prendre une semaine de congé au moment où il y a beaucoup de travail. Vous discutez avec votre responsable pour le / la convaincre. L'examinateur joue le rôle du / de la responsable."],
      ["voyages", "Vous avez réservé un hôtel pour vos vacances, mais la chambre ne correspond pas à la description (bruit, vue, propreté). Vous vous plaignez à la réception et demandez une solution. L'examinateur joue le rôle du / de la réceptionniste."],
      ["conso", "Vous avez acheté un téléphone qui ne marche plus après deux semaines. Le vendeur refuse de vous le rembourser. Vous essayez de trouver une solution. L'examinateur joue le rôle du vendeur."],
      ["log", "Votre voisin organise des fêtes très bruyantes tous les week-ends. Vous allez le voir pour en discuter et trouver une solution ensemble. L'examinateur joue le rôle du voisin."],
      ["loisirs", "Vous voulez partir en vacances à la montagne, mais votre ami(e) préfère la mer. Vous discutez pour le / la convaincre. L'examinateur joue le rôle de l'ami(e)."],
      ["edu", "Votre frère veut arrêter ses études pour travailler tout de suite. Vous discutez avec lui pour le faire changer d'avis. L'examinateur joue le rôle du frère."],
      ["sante", "Votre ami(e) dort très peu et ne fait jamais de sport. Vous essayez de le / la convaincre de changer ses habitudes. L'examinateur joue le rôle de l'ami(e)."],
      ["tech", "Votre ami(e) passe plusieurs heures par jour sur son téléphone, même pendant les repas. Vous lui en parlez pour qu'il / elle change ses habitudes. L'examinateur joue le rôle de l'ami(e)."],
      ["env", "Vous proposez à vos collègues d'organiser le tri des déchets au bureau. Un(e) collègue trouve que c'est inutile. Vous essayez de le / la convaincre. L'examinateur joue le rôle du / de la collègue."],
      ["alim", "Vous organisez un repas avec des amis et vous voulez un menu végétarien. Votre ami(e) n'est pas d'accord. Vous discutez pour trouver un compromis. L'examinateur joue le rôle de l'ami(e)."],
      ["transports", "Vous voulez convaincre un(e) collègue de venir au travail à vélo avec vous au lieu de prendre la voiture. L'examinateur joue le rôle du / de la collègue."]
    ],
    T3: [
      ["tech", "Document : « Les écrans, nouveaux baby-sitters ? » Selon une étude récente, les enfants de moins de six ans passent en moyenne près de trois heures par jour devant un écran. Beaucoup de parents reconnaissent utiliser les tablettes pour occuper leurs enfants pendant qu'ils travaillent ou préparent le repas. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["trav", "Document : « La semaine de quatre jours séduit » Plusieurs entreprises testent la semaine de quatre jours, sans baisse de salaire. Les salariés se disent plus motivés et moins stressés, mais certains employeurs craignent une baisse de la productivité. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["env", "Document : « Moins de viande pour la planète ? » Pour réduire les émissions de gaz à effet de serre, des cantines scolaires proposent désormais un ou deux repas végétariens par semaine. Certains parents applaudissent, d'autres s'inquiètent pour l'équilibre alimentaire de leurs enfants. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["edu", "Document : « Apprendre sans professeur ? » Applications, vidéos, cours en ligne : jamais il n'a été aussi facile d'apprendre seul. Pourtant, beaucoup d'étudiants abandonnent leur formation en ligne avant la fin. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["sante", "Document : « Le sport sur ordonnance » Dans certaines villes, les médecins peuvent désormais prescrire une activité physique à leurs patients, comme ils prescrivent un médicament. L'objectif : lutter contre les maladies liées au manque d'activité. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["medias", "Document : « Tous journalistes ? » Avec un simple smartphone, chacun peut aujourd'hui filmer un événement et le partager en quelques secondes. Ces images circulent souvent plus vite que les informations des journalistes professionnels. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["voyages", "Document : « Trop de touristes ? » Venise, Barcelone, Amsterdam… Certaines villes limitent le nombre de touristes et créent des taxes pour les visiteurs. Les habitants se plaignent du bruit, de la hausse des loyers et de la disparition des petits commerces. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["relations", "Document : « Seuls, mais connectés » Une enquête révèle qu'un jeune sur cinq se sent souvent seul, alors qu'il passe plusieurs heures par jour à échanger avec ses amis sur les réseaux sociaux. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["conso", "Document : « La mode à petit prix » Des vêtements à moins de cinq euros, de nouvelles collections chaque semaine : la « mode rapide » séduit les jeunes. Mais elle est critiquée pour ses conséquences sur l'environnement et sur les conditions de travail. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["ville", "Document : « Retour à la campagne » Depuis quelques années, de plus en plus de familles quittent les grandes villes pour s'installer à la campagne. Elles recherchent le calme, de l'espace et un coût de la vie moins élevé. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["alim", "Document : « Le fait maison revient à la mode » Face à la hausse des prix et aux inquiétudes sur la qualité des produits industriels, de plus en plus de familles cuisinent elles-mêmes leurs repas et font leur pain. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["culture", "Document : « Des musées gratuits pour tous ? » Dans plusieurs pays, l'entrée des musées nationaux est gratuite. Pour leurs défenseurs, la culture doit être accessible à tous ; pour d'autres, la gratuité coûte trop cher à l'État. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["sport", "Document : « L'e-sport, un vrai sport ? » Les compétitions de jeux vidéo attirent des millions de spectateurs et certains joueurs deviennent professionnels. Faut-il les considérer comme de vrais sportifs ? Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."],
      ["fam", "Document : « Les grands-parents, piliers de la famille » Selon une enquête, près d'un grand-parent sur deux garde régulièrement ses petits-enfants. Une aide précieuse pour les parents qui travaillent, mais parfois une fatigue pour les grands-parents. Dégagez le problème soulevé par ce document, puis présentez votre opinion de manière argumentée."]
    ]
  },
  B2: {
    ET3: [
      ["trav", "Votre entreprise envisage de supprimer les bureaux individuels pour créer des espaces de travail partagés (open space). Vous écrivez une lettre au directeur des ressources humaines pour exprimer votre point de vue de manière argumentée et proposer des solutions."],
      ["env", "Votre municipalité a décidé d'interdire les sacs plastiques et les emballages jetables sur le marché hebdomadaire. Certains commerçants protestent. Vous écrivez un article pour le journal local dans lequel vous défendez ou critiquez cette décision."],
      ["tech", "Le lycée de votre ville veut interdire totalement les téléphones portables dans l'établissement, même pendant les pauses. En tant que parent d'élève, vous écrivez au proviseur pour donner votre avis argumenté."],
      ["edu", "Un magazine consacre un dossier à la question : « L'université doit-elle être gratuite pour tous ? » Vous envoyez une contribution argumentée à la rédaction."],
      ["medias", "Sur le site d'un journal, vous lisez un article qui affirme que la publicité devrait être interdite dans les programmes pour enfants. Vous écrivez un commentaire argumenté pour réagir."],
      ["sante", "Votre entreprise propose de financer un abonnement à une salle de sport pour tous les salariés, mais elle supprimerait en échange la prime de fin d'année. Vous écrivez au comité d'entreprise pour donner votre avis argumenté."],
      ["soc", "Le gouvernement envisage de créer un service civique obligatoire de six mois pour tous les jeunes de 18 ans. Vous écrivez au courrier des lecteurs d'un quotidien pour défendre votre position."],
      ["culture", "Le conseil municipal veut transformer un vieux cinéma du centre-ville en centre commercial. Vous écrivez une lettre ouverte au maire pour défendre ou contester ce projet."],
      ["conso", "Sur un forum, des internautes débattent : « Faut-il taxer davantage les achats en ligne pour protéger les petits commerces ? » Vous publiez une contribution argumentée."],
      ["ville", "Dans votre quartier, un projet prévoit de remplacer un parc par des logements. Vous écrivez à l'association des habitants pour exprimer votre opinion de manière argumentée."],
      ["transports", "Le gouvernement envisage de rendre les transports en commun gratuits dans toutes les grandes villes. Vous rédigez un article pour un magazine d'actualité dans lequel vous analysez les avantages et les limites de cette mesure."],
      ["alim", "Le restaurant universitaire de votre ville envisage de ne plus servir de viande. Vous écrivez au directeur du restaurant pour exprimer votre position de manière argumentée."],
      ["sport", "Votre ville est candidate pour accueillir une grande compétition sportive internationale. Vous écrivez au journal local pour dire si, selon vous, c'est une bonne idée."],
      ["mondial", "Un magazine pose la question : « Faut-il encore apprendre des langues étrangères à l'heure de la traduction automatique ? » Vous envoyez un article argumenté à la rédaction."],
      ["relations", "Une association de votre ville constate que de moins en moins de personnes s'engagent comme bénévoles. Vous écrivez un article pour son bulletin afin d'expliquer pourquoi le bénévolat est important et comment encourager l'engagement."]
    ],
    T3: [
      ["tech", "Document : « L'intelligence artificielle au bureau » Rédiger des courriels, résumer des réunions, traduire des documents : les outils d'intelligence artificielle s'invitent dans les entreprises. Pour leurs partisans, ils libèrent les salariés des tâches répétitives. Leurs détracteurs redoutent des suppressions d'emplois et une perte de compétences. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["env", "Document : « Faut-il renoncer à l'avion ? » Le transport aérien représente une part croissante des émissions de gaz à effet de serre. Certains voyageurs choisissent désormais le train, même pour de longues distances, tandis que d'autres estiment que voyager en avion reste une ouverture sur le monde. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["edu", "Document : « Des notes, pour quoi faire ? » Plusieurs écoles ont supprimé les notes chiffrées au profit d'une évaluation par compétences. Les enseignants qui ont tenté l'expérience parlent d'élèves moins stressés ; certains parents, eux, disent ne plus savoir où en sont leurs enfants. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["trav", "Document : « Le droit à la déconnexion » Courriels le soir, messages le week-end : avec le smartphone, le travail ne s'arrête plus jamais. Certains pays ont adopté un « droit à la déconnexion » pour protéger la vie privée des salariés. Mais est-il vraiment respecté ? Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["medias", "Document : « Les influenceurs, nouveaux prescripteurs » Vêtements, alimentation, voyages, placements financiers : les influenceurs orientent les choix de millions d'abonnés. Face aux abus, plusieurs pays ont adopté des lois pour encadrer leur activité. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["sante", "Document : « La santé en données » Montres connectées, applications de suivi du sommeil ou de l'alimentation : nous mesurons notre santé en permanence. Une révolution pour la prévention, selon certains médecins ; un risque pour la vie privée, selon les associations. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["soc", "Document : « Vivre ensemble entre générations » Des résidences accueillent désormais étudiants et personnes âgées sous le même toit : les jeunes paient un loyer réduit en échange de leur présence et de petits services. Une solution à la solitude et à la crise du logement ? Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["culture", "Document : « Le patrimoine coûte-t-il trop cher ? » Restaurer un château ou une cathédrale coûte des millions d'euros. Certains proposent de confier davantage le patrimoine aux entreprises privées, en échange de publicité. D'autres y voient une marchandisation de la culture. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["conso", "Document : « Réparer plutôt que jeter » Pour lutter contre l'obsolescence programmée, les ateliers de réparation se multiplient et des aides financent la réparation des appareils électroménagers. Mais acheter neuf reste souvent plus simple, et parfois moins cher. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["ville", "Document : « La ville sans voitures » Plusieurs grandes villes européennes transforment leurs centres en zones piétonnes. Les habitants apprécient le calme et l'air plus pur ; les commerçants craignent de perdre les clients qui venaient en voiture. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["alim", "Document : « Manger local, une solution d'avenir ? » Marchés de producteurs, paniers de légumes, restaurants qui s'approvisionnent à moins de cent kilomètres : le « manger local » séduit. Pourtant, ses produits restent plus chers et l'offre ne suffit pas toujours à nourrir les grandes villes. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["sport", "Document : « Le sport de haut niveau, un modèle pour les jeunes ? » Salaires astronomiques, dopage, pression médiatique : le sport professionnel fait souvent la une pour de mauvaises raisons. Pourtant, les grands champions donnent encore envie à des millions de jeunes de se mettre au sport. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["mondial", "Document : « Le monde en anglais ? » Dans les universités et les entreprises, l'anglais s'impose comme langue commune. Pratique pour communiquer, cette domination inquiète les défenseurs de la diversité linguistique, qui y voient une menace pour les autres langues. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["relations", "Document : « Le bénévolat change de visage » Les associations peinent à recruter des bénévoles réguliers. Les jeunes préfèrent souvent des engagements ponctuels, pour un festival ou une collecte, plutôt qu'un engagement sur le long terme. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."],
      ["transports", "Document : « Le vélo, roi de la ville ? » Pistes cyclables, aides à l'achat de vélos électriques : les villes encouragent le vélo. Mais la cohabitation avec les piétons et les automobilistes reste parfois difficile. Dégagez la problématique de ce document, puis présentez votre opinion dans un exposé structuré. Vous la défendrez ensuite dans un débat avec l'examinateur."]
    ]
  }
};

// id estável: D<nível>-<tâche>-<nn> (nunca colide com os ids do TCF).
const SUJETS = {};
for (const n of NIVEAUX) {
  SUJETS[n] = {};
  for (const t of Object.keys(S[n])) {
    SUJETS[n][t] = S[n][t].map(([e, texto], i) => ({ id: `D${n}-${t}-${String(i + 1).padStart(2, "0")}`, e, f: 1, t: texto, pf: "DELF-" + n }));
  }
}

module.exports = { NIVEAUX, EIXOS, NIVEIS, TRAMES, SUJETS };
