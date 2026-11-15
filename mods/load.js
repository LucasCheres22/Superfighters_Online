// Lista de mods carregados (em ordem). Adicione o nome do arquivo .js que voce colocar na pasta mods/.
// Funciona direto de file:// (sem servidor).
var SF_MODS = ["exemplo.js"];
for (var i = 0; i < SF_MODS.length; i++) document.write('<script src="mods/' + SF_MODS[i] + '"><\/script>');
