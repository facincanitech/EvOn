const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1000;
canvas.height = 600;

// Debugging
window.onerror = function(msg, url, line) {
    console.error("Erro: " + msg + "\nLinha: " + line);
};

// Game State
const game = {
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    enemies: [],
    projectiles: [],
    drops: [],
    puddles: [],
    skyStrikes: [],
    particles: [],
    lastEnemySpawn: 0,
    lastShootTime: 0,
    shootInterval: 1000,
    lastSkyStrike: 0,
    lastChainLightning: 0,
    lastSlimeTime: 0,
    lastSwordTime: 0,
    spawnRate: 2000,
    worldX: 0,
    worldY: 0,
    startTime: Date.now(),
    lastBossSpawn: 0,
    levelUpsCount: 0,
    isGameOver: false,
    isPaused: false
};

// Asset Loader
const sprites = {
    player: {
        frente: { parado: null, andando: [] },
        costa: { parado: null, andando: [] },
        esquerda: { parado: null, andando: [] },
        direita: { parado: null, andando: [] }
    }
};

function loadSprites() {
    const directions = ['frente', 'costa', 'esquerda', 'direita'];
    directions.forEach(dir => {
        // Parado
        const imgP = new Image();
        imgP.src = `andando ${dir}/parado ${dir}.png`;
        sprites.player[dir].parado = imgP;

        // Andando
        const img1 = new Image(); img1.src = `andando ${dir}/andando ${dir}1.png`;
        const img2 = new Image(); img2.src = `andando ${dir}/andando ${dir}2.png`;
        sprites.player[dir].andando = [img1, imgP, img2, imgP];
    });
}

loadSprites();

class Player {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.width = 64;
        this.height = 64;
        this.speed = 4;
        this.hp = 100;
        this.maxHp = 100;
        this.direction = 'frente';
        this.isMoving = false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.attackDmg = 25;
        this.attackRange = 100;
        this.auraLevel = 0;
        this.auraRadius = 100;
        this.auraDmg = 0.5;
        this.skyStrikeLevel = 0;
        this.chainLevel = 0;
        this.slimeLevel = 0;
        this.swordLevel = 0;
    }

    update(keys) {
        if (game.isPaused || game.isGameOver) return;
        this.isMoving = false;
        let dx = 0;
        let dy = 0;

        if (keys['w'] || keys['ArrowUp']) { dy -= 1; this.direction = 'costa'; }
        else if (keys['s'] || keys['ArrowDown']) { dy += 1; this.direction = 'frente'; }
        if (keys['a'] || keys['ArrowLeft']) { dx -= 1; this.direction = 'esquerda'; }
        else if (keys['d'] || keys['ArrowRight']) { dx += 1; this.direction = 'direita'; }

        if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            const length = Math.sqrt(dx * dx + dy * dy);
            game.worldX -= (dx / length) * this.speed;
            game.worldY -= (dy / length) * this.speed;
        }

        // Animation
        if (this.isMoving) {
            this.animTimer++;
            const frames = sprites.player[this.direction].andando.length;
            if (frames > 0 && this.animTimer > 10) {
                this.animFrame = (this.animFrame + 1) % frames;
                this.animTimer = 0;
            }
        } else {
            this.animFrame = 0;
        }

        // Auto Shoot
        if (Date.now() - game.lastShootTime > game.shootInterval) {
            this.shoot();
            game.lastShootTime = Date.now();
        }

        // Skills logic
        if (this.auraLevel > 0) {
            game.enemies.forEach(enemy => {
                const ex = enemy.x + game.worldX;
                const ey = enemy.y + game.worldY;
                const dist = Math.sqrt((this.x - ex - enemy.width/2)**2 + (this.y - ey - enemy.height/2)**2);
                if (dist < this.auraRadius + (this.auraLevel * 5)) enemy.takeDamage(this.auraDmg * this.auraLevel);
            });
        }

        if (this.skyStrikeLevel > 0 && Date.now() - game.lastSkyStrike > 3000 / this.skyStrikeLevel) {
            this.triggerSkyStrike();
            game.lastSkyStrike = Date.now();
        }

        if (this.chainLevel > 0 && Date.now() - game.lastChainLightning > 2500 / this.chainLevel) {
            this.triggerChainLightning();
            game.lastChainLightning = Date.now();
        }

        if (this.slimeLevel > 0 && Date.now() - game.lastSlimeTime > 4000 / this.slimeLevel) {
            this.triggerSlime();
            game.lastSlimeTime = Date.now();
        }

        if (this.swordLevel > 0 && Date.now() - game.lastSwordTime > 2000 / this.swordLevel) {
            this.triggerSword();
            game.lastSwordTime = Date.now();
        }
    }

    shoot() {
        let nearest = null;
        let minDist = Infinity;
        game.enemies.forEach(enemy => {
            const dist = Math.sqrt((enemy.x + game.worldX - this.x)**2 + (enemy.y + game.worldY - this.y)**2);
            if (dist < minDist) { minDist = dist; nearest = enemy; }
        });
        if (nearest) {
            game.projectiles.push(new Projectile(this.x, this.y, nearest.x + nearest.width/2, nearest.y + nearest.height/2));
        }
    }

    triggerSkyStrike() {
        if (game.enemies.length === 0) return;
        const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
        game.skyStrikes.push({ x: target.x, y: target.y, timer: 40, radius: 80 + (this.skyStrikeLevel * 20) });
    }

    triggerChainLightning() {
        if (game.enemies.length === 0) return;
        let current = game.enemies[Math.floor(Math.random() * game.enemies.length)];
        let hits = 2 + this.chainLevel;
        let visited = new Set();
        const chainEffect = () => {
            if (hits <= 0 || !current) return;
            current.takeDamage(20 + this.chainLevel * 10);
            visited.add(current);
            createParticles(current.x + game.worldX + 20, current.y + game.worldY + 20, '#f1c40f');
            let next = null; let minDist = 300;
            game.enemies.forEach(e => {
                if (!visited.has(e)) {
                    const d = Math.sqrt((e.x - current.x)**2 + (e.y - current.y)**2);
                    if (d < minDist) { minDist = d; next = e; }
                }
            });
            current = next; hits--; setTimeout(chainEffect, 100);
        };
        chainEffect();
    }

    triggerSlime() {
        if (game.enemies.length === 0) return;
        const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
        const dx = target.x - (this.x - game.worldX);
        const dy = target.y - (this.y - game.worldY);
        const length = Math.sqrt(dx * dx + dy * dy);
        game.projectiles.push({
            worldX: this.x - game.worldX, worldY: this.y - game.worldY,
            vx: (dx / length) * 6, vy: (dy / length) * 6, life: 60, isSlime: true,
            update: function() {
                this.worldX += this.vx; this.worldY += this.vy; this.life--;
                if (this.life <= 0) {
                    game.puddles.push({ x: this.worldX, y: this.worldY, radius: 60, life: 300, dmg: 0.3 * player.slimeLevel });
                }
            },
            draw: function() {
                ctx.fillStyle = '#9b59b6'; ctx.beginPath(); ctx.arc(this.worldX + game.worldX, this.worldY + game.worldY, 10, 0, Math.PI * 2); ctx.fill();
            }
        });
    }

    triggerSword() {
        if (game.enemies.length === 0) return;
        const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
        const dx = target.x - (this.x - game.worldX);
        const dy = target.y - (this.y - game.worldY);
        const length = Math.sqrt(dx * dx + dy * dy);
        game.projectiles.push({
            worldX: this.x - game.worldX, worldY: this.y - game.worldY,
            vx: (dx / length) * 12, vy: (dy / length) * 12, life: 80, pierce: true,
            update: function() {
                this.worldX += this.vx; this.worldY += this.vy; this.life--;
                game.enemies.forEach(e => {
                    const d = Math.sqrt((this.worldX - e.x - 20)**2 + (this.worldY - e.y - 20)**2);
                    if (d < 30) e.takeDamage(10 + player.swordLevel * 10);
                });
            },
            draw: function() {
                ctx.save(); ctx.translate(this.worldX + game.worldX, this.worldY + game.worldY);
                ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI/4);
                ctx.fillStyle = '#bdc3c7'; ctx.fillRect(-15, -2, 30, 4);
                ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-15, -5, 5, 10); ctx.restore();
            }
        });
    }

    draw() {
        if (this.auraLevel > 0) {
            ctx.save(); ctx.strokeStyle = 'rgba(78, 205, 196, 0.3)'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.arc(this.x + this.width/2, this.y + this.height/2, this.auraRadius, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(78, 205, 196, 0.05)'; ctx.fill(); ctx.restore();
        }
        let img; const dirSprites = sprites.player[this.direction];
        if (this.isMoving && dirSprites.andando.length > 0) img = dirSprites.andando[this.animFrame];
        else img = dirSprites.parado;

        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.beginPath(); ctx.ellipse(this.x + this.width/2, this.y + this.height - 5, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = '#ff6b6b'; ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Projectile {
    constructor(x, y, targetWorldX, targetWorldY) {
        this.worldX = x - game.worldX; this.worldY = y - game.worldY;
        const dx = targetWorldX - this.worldX; const dy = targetWorldY - this.worldY;
        const length = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / length) * 8; this.vy = (dy / length) * 8; this.life = 100;
    }
    update() {
        this.worldX += this.vx; this.worldY += this.vy; this.life--;
        game.enemies.forEach(enemy => {
            const dist = Math.sqrt((this.worldX - (enemy.x + enemy.width/2))**2 + (this.worldY - (enemy.y + enemy.height/2))**2);
            if (dist < 30) { enemy.takeDamage(player.attackDmg); this.life = 0; }
        });
    }
    draw() {
        const screenX = this.worldX + game.worldX; const screenY = this.worldY + game.worldY;
        ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(screenX, screenY, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
    }
}

class Enemy {
    constructor() {
        const angle = Math.random() * Math.PI * 2;
        const dist = 600;
        this.x = (player.x - game.worldX) + Math.cos(angle) * dist;
        this.y = (player.y - game.worldY) + Math.sin(angle) * dist;
        this.width = 40; this.height = 40;
        this.hp = 50 + (game.level * 10);
        this.speed = 0.5 + Math.random() * 0.5;
    }
    update(player) {
        const px = player.x - game.worldX; const py = player.y - game.worldY;
        const dx = px - this.x; const dy = py - this.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0) { this.x += (dx / length) * this.speed; this.y += (dy / length) * this.speed; }
        if (length < 30) { player.hp -= 0.2; updateUI(); }
    }
    draw() {
        const screenX = this.x + game.worldX; const screenY = this.y + game.worldY;
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(screenX + 20, screenY + 20, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4ecdc4'; ctx.beginPath(); ctx.arc(screenX + 20, screenY + 20, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#444'; ctx.fillRect(screenX + 12, screenY + 15, 4, 4); ctx.fillRect(screenX + 24, screenY + 15, 4, 4);
    }
    takeDamage(dmg) {
        this.hp -= dmg;
        createParticles(this.x + game.worldX + 20, this.y + game.worldY + 20, '#4ecdc4');
        if (this.hp <= 0) { game.drops.push(new Drop(this.x, this.y)); return true; }
        return false;
    }
}

class Boss extends Enemy {
    constructor() {
        super();
        this.width = 120; this.height = 120;
        this.hp = 1000 + (game.level * 200);
        this.speed = 0.3;
        this.isBoss = true;
    }
    draw() {
        const screenX = this.x + game.worldX; const screenY = this.y + game.worldY;
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.rect(screenX, screenY, this.width, this.height); ctx.fill();
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.font = 'bold 30px Patrick Hand'; ctx.textAlign = 'center';
        ctx.fillText("CHEFE", screenX + this.width/2, screenY + 30);
        ctx.fillStyle = '#000'; ctx.fillRect(screenX + 30, screenY + 50, 15, 15); ctx.fillRect(screenX + 75, screenY + 50, 15, 15);
    }
}

class Drop {
    constructor(x, y) { this.x = x; this.y = y; this.value = 20; }
    update(player) {
        const px = player.x - game.worldX; const py = player.y - game.worldY;
        const dist = Math.sqrt((this.x - px)**2 + (this.y - py)**2);
        if (dist < 40) { game.xp += this.value; checkLevelUp(); updateUI(); return true; }
        return false;
    }
    draw() {
        const screenX = this.x + game.worldX; const screenY = this.y + game.worldY;
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(screenX, screenY, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.stroke();
    }
}

function createParticles(x, y, color) {
    for(let i=0; i<8; i++) {
        game.particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 1, color });
    }
}

function updateUI() {
    document.getElementById('level-val').innerText = game.level;
    document.getElementById('xp-fill').style.width = `${(game.xp / game.xpToNextLevel) * 100}%`;
    document.getElementById('hp-fill').style.width = `${Math.max(0, player.hp)}%`;
}

function checkLevelUp() {
    if (game.xp >= game.xpToNextLevel) {
        game.level++; game.levelUpsCount++;
        game.xp -= game.xpToNextLevel; game.xpToNextLevel = Math.floor(game.xpToNextLevel * 1.5);
        player.maxHp += 20; player.hp = player.maxHp;
        if (game.levelUpsCount % 5 === 0) spawnBoss();
        showSkillMenu();
    }
}

function spawnBoss() { game.enemies.push(new Boss()); createParticles(player.x, player.y, '#e74c3c'); }

const SKILLS = [
    { id: 'aura', name: 'Aura Azul', desc: 'Dano em área ao redor' },
    { id: 'chain', name: 'Raio Ricochete', desc: 'Raio que pula entre inimigos' },
    { id: 'skyStrike', name: 'Raio do Céu', desc: 'Dano massivo de cima' },
    { id: 'slime', name: 'Gosma Roxa', desc: 'Deixa poça de dano no chão' },
    { id: 'sword', name: 'Espada Lançada', desc: 'Lança espadas que atravessam' }
];

const ATTRIBUTES = [
    { id: 'speed', name: 'Velocidade +', desc: 'Move mais rápido' },
    { id: 'damage', name: 'Dano do Tiro +', desc: 'Bolinhas tiram mais HP' },
    { id: 'range', name: 'Alcance +', desc: 'Atira mais longe' },
    { id: 'shootRate', name: 'Cadência +', desc: 'Atira mais rápido' },
    { id: 'hp', name: 'Vida Máxima +', desc: 'Aumenta sua saúde' }
];

function showSkillMenu() {
    game.isPaused = true;
    const menu = document.getElementById('skill-menu');
    const optionsCont = menu.querySelector('.skill-options');
    optionsCont.innerHTML = '';
    const skill = SKILLS[Math.floor(Math.random() * SKILLS.length)];
    const shuffledAttrs = [...ATTRIBUTES].sort(() => 0.5 - Math.random());
    const attrs = shuffledAttrs.slice(0, 2);
    [skill, ...attrs].forEach(choice => {
        const btn = document.createElement('button');
        btn.innerHTML = `<strong>${choice.name}</strong><br><small>${choice.desc}</small>`;
        btn.onclick = () => upgradeSkill(choice.id);
        optionsCont.appendChild(btn);
    });
    menu.classList.remove('hidden');
}

function upgradeSkill(type) {
    if (type === 'speed') player.speed += 1;
    if (type === 'damage') player.attackDmg += 15;
    if (type === 'range') player.attackRange += 50;
    if (type === 'shootRate') game.shootInterval = Math.max(200, game.shootInterval - 150);
    if (type === 'hp') { player.maxHp += 50; player.hp = player.maxHp; }
    if (type === 'aura') { player.auraLevel++; player.auraRadius += 15; }
    if (type === 'chain') player.chainLevel++;
    if (type === 'skyStrike') player.skyStrikeLevel++;
    if (type === 'slime') player.slimeLevel++;
    if (type === 'sword') player.swordLevel++;
    game.isPaused = false;
    document.getElementById('skill-menu').classList.add('hidden');
    updateUI();
}

const player = new Player();
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function gameLoop(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(game.worldX % 100, game.worldY % 100);
    ctx.strokeStyle = '#abced4'; ctx.lineWidth = 2;
    for(let i = -100; i < canvas.width + 100; i += 50) { ctx.beginPath(); ctx.moveTo(i, -100); ctx.lineTo(i, canvas.height + 100); ctx.stroke(); }
    for(let j = -100; j < canvas.height + 100; j += 50) { ctx.beginPath(); ctx.moveTo(-100, j); ctx.lineTo(canvas.width + 100, j); ctx.stroke(); }
    ctx.restore();

    if (player.hp <= 0) {
        game.isGameOver = true;
        document.getElementById('final-level').innerText = game.level;
        document.getElementById('game-over-screen').classList.remove('hidden');
        return;
    }

    if (!game.isPaused) {
        player.update(keys);
        const elapsed = Date.now() - game.startTime;
        game.spawnRate = Math.max(200, 2000 - (elapsed / 5000) * 100);
        if (elapsed - game.lastBossSpawn > 120000) { spawnBoss(); game.lastBossSpawn = elapsed; }
        if (timestamp - game.lastEnemySpawn > game.spawnRate) { game.enemies.push(new Enemy()); game.lastEnemySpawn = timestamp; }
        game.projectiles = game.projectiles.filter(p => {
            if (p.update) p.update();
            else {
                p.worldX += p.vx; p.worldY += p.vy; p.life--;
                game.enemies.forEach(enemy => {
                    const dist = Math.sqrt((p.worldX - (enemy.x + enemy.width/2))**2 + (p.worldY - (enemy.y + enemy.height/2))**2);
                    if (dist < 30) { enemy.takeDamage(player.attackDmg); p.life = 0; }
                });
            }
            return p.life > 0;
        });
        game.puddles = game.puddles.filter(p => {
            p.life--;
            game.enemies.forEach(e => {
                const d = Math.sqrt((p.x - e.x - 20)**2 + (p.y - e.y - 20)**2);
                if (d < p.radius) e.takeDamage(p.dmg);
            });
            return p.life > 0;
        });
        game.skyStrikes = game.skyStrikes.filter(s => {
            s.timer--;
            if (s.timer === 0) {
                game.enemies.forEach(e => {
                    const d = Math.sqrt((s.x - e.x)**2 + (s.y - e.y)**2);
                    if (d < s.radius) e.takeDamage(100 + player.skyStrikeLevel * 50);
                });
                createParticles(s.x + game.worldX, s.y + game.worldY, '#3498db');
            }
            return s.timer > -10;
        });
        game.enemies = game.enemies.filter(enemy => { enemy.update(player); return enemy.hp > 0; });
        game.drops = game.drops.filter(drop => !drop.update(player));
        game.particles = game.particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; return p.life > 0; });
    }

    player.draw();
    game.puddles.forEach(p => { ctx.fillStyle = 'rgba(155, 89, 182, 0.4)'; ctx.beginPath(); ctx.arc(p.x + game.worldX, p.y + game.worldY, p.radius, 0, Math.PI * 2); ctx.fill(); });
    game.skyStrikes.forEach(s => {
        if (s.timer > 0) { ctx.strokeStyle = 'rgba(231, 76, 60, 0.5)'; ctx.beginPath(); ctx.arc(s.x + game.worldX, s.y + game.worldY, s.radius, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(52, 152, 219, 0.8)'; ctx.fillRect(s.x + game.worldX - 10, -500, 20, s.y + game.worldY + 500); }
    });
    game.drops.forEach(d => d.draw()); game.enemies.forEach(e => e.draw());
    game.projectiles.forEach(p => {
        if (p.draw) p.draw();
        else {
            const screenX = p.worldX + game.worldX; const screenY = p.worldY + game.worldY;
            ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(screenX, screenY, 6, 0, Math.PI * 2); ctx.fill();
        }
    });
    game.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); ctx.globalAlpha = 1; });
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
updateUI();
