// MOD DE EXEMPLO: uma arma nova e um ajuste na vida do jogador.
// Mods rodam depois dos dados base e podem alterar qualquer coisa em SF.*
SF.weapons.laser = {
  name: "Canhao Maluco", ammo: 40, cooldown: 4, spread: 2, speed: 45,
  damage: 12, critChance: 10, critDamage: 20, range: 500, pellets: 3, auto: true,
  sound: ["magnum"], empty: "outofammo_heavy"
};
SF.maps.warehouse.weaponSpawns.push([480, 470, "laser"]);
// SF.player.health = 150;   // descomente para vida extra
