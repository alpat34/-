// Misteri Ulang Tahun - Animasi Buah & Ledakan

console.log('Script.js dimuat...');

// Tunggu DOM siap
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  const startBtn = document.getElementById('start-btn');
  const mainContent = document.getElementById('main-content');
  const countdownScreen = document.getElementById('countdown-screen');
  const countdownNumber = document.getElementById('countdown-number');
  const fruitContainer = document.getElementById('fruit-container');
  const explosionScreen = document.getElementById('explosion-screen');
  const explosionOverlay = document.getElementById('explosion-overlay');
  const explosionParticles = document.getElementById('explosion-particles');
  const finalMessage = document.getElementById('final-message');
  const beepSound = document.getElementById('beep-sound');
  const slashSound = document.getElementById('slash-sound');
  const bombSound = document.getElementById('bomb-sound');
  const bgMusic = document.getElementById('bg-music');
  
  console.log('Start button found:', startBtn);
  
  if (!startBtn) {
    console.error('Start button tidak ditemukan!');
    return;
  }
  
  // Cek ketersediaan audio elements
  if (!beepSound) console.warn('Beep sound tidak ditemukan');
  if (!slashSound) console.warn('Slash sound tidak ditemukan');
  if (!bombSound) console.warn('Bomb sound tidak ditemukan');
  
  // Set volume efek suara (dikecilkan sedikit)
  const DEFAULT_SFX_VOLUME = 0.5; // 50%
  const BOMB_SOUND_OFFSET_SEC = 0.06; // lewati jeda awal MP3 (~60ms)
  if (beepSound) beepSound.volume = 0.4; // countdown sedikit lebih pelan
  if (slashSound) slashSound.volume = DEFAULT_SFX_VOLUME;
  if (bombSound) bombSound.volume = DEFAULT_SFX_VOLUME;
  if (bombSound) {
    bombSound.preload = 'auto';
    try { bombSound.load(); } catch(_) {}
  }
  if (bgMusic) {
    bgMusic.volume = 0.5;
    bgMusic.preload = 'auto';
  }

  // Web Audio API untuk pemutaran bom ultra-rendah-latensi
  let audioContext = null;
  let bombAudioBuffer = null;
  let bombGainNode = null;
  
  function ensureAudioContext() {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioContext = new Ctx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  }
  
  async function loadBombAudioBuffer() {
    try {
      ensureAudioContext();
      if (!audioContext || bombAudioBuffer) return;
      const srcElem = document.querySelector('#bomb-sound source');
      const srcUrl = bombSound?.currentSrc || srcElem?.src;
      if (!srcUrl) return;
      const response = await fetch(srcUrl);
      const arrayBuffer = await response.arrayBuffer();
      // decodeAudioData bisa menerima ArrayBuffer langsung; gunakan salinan aman
      bombAudioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      if (!bombGainNode) {
        bombGainNode = audioContext.createGain();
        bombGainNode.gain.value = DEFAULT_SFX_VOLUME;
        bombGainNode.connect(audioContext.destination);
      }
    } catch (_) {
      // fallback akan digunakan jika gagal
    }
  }
  
  function playBombSoundLowLatency() {
    try {
      if (audioContext && bombAudioBuffer) {
        const source = audioContext.createBufferSource();
        source.buffer = bombAudioBuffer;
        if (bombGainNode) {
          source.connect(bombGainNode);
        } else {
          source.connect(audioContext.destination);
        }
        source.start(0);
        return true;
      }
    } catch (_) {
      // abaikan dan fallback
    }
    return false;
  }
  
  let currentCountdown = 5;
  let countdownInterval;
  let fruitElements = [];
  let slashElements = [];
  
  // Fisika proyektil untuk buah/bom
  let projectiles = [];
  let rafId = null;
  let lastFrameTimeMs = 0;
  
  function setElementTransformPosition(element, x, y, angleDeg) {
    // Pusatkan elemen (ukuran 120x120) pada koordinat (x, y)
    element.style.left = (x - 60) + 'px';
    element.style.top = (y - 60) + 'px';
    element.style.transform = `rotate(${angleDeg}deg)`;
  }
  
  function launchProjectile(element, options) {
    const { type, countdown, targetApexX, targetApexY, gravityDownScale, initialSpeedX, startX: customStartX } = options;
    let startX;
    if (typeof customStartX === 'number') {
      startX = customStartX;
    } else {
      startX = Math.random() * (window.innerWidth - 240) + 120; // default: acak
    }
    const startY = window.innerHeight + 100;
    const gravity = 2000; // px/s^2

    // Hitung kecepatan awal agar apex berada di target (jika disediakan)
    let initialSpeedY;
    let vx;
    if (typeof initialSpeedX === 'number') {
      vx = initialSpeedX;
    } else if (typeof targetApexX === 'number' && typeof targetApexY === 'number') {
      const dy = Math.max(10, (startY - targetApexY)); // pastikan positif
      const vyMag = Math.sqrt(2 * gravity * dy);
      initialSpeedY = -vyMag; // ke atas (negatif dalam koordinat DOM)
      const tApex = vyMag / gravity; // waktu menuju apex
      const dx = (targetApexX - startX);
      vx = dx / tApex;
      // Tambah sedikit variasi agar tidak identik
      vx += (Math.random() * 120) - 60;
    } else {
      vx = (Math.random() * 600) - 300; // -300..300 px/s
      initialSpeedY = -(900 + Math.random() * 400); // ke atas
    }
    if (typeof initialSpeedY !== 'number') {
      // Hitung initialSpeedY jika belum dihitung
      if (typeof targetApexY === 'number') {
        const dy = Math.max(10, (startY - targetApexY));
        initialSpeedY = -Math.sqrt(2 * gravity * dy);
      } else {
        initialSpeedY = -(900 + Math.random() * 400);
      }
    }

    const initialAngle = Math.random() * 360;
    const angularVelocity = (Math.random() * 720) - 360; // derajat/s

    const state = {
      element,
      type,
      countdown,
      x: startX,
      y: startY,
      vx: vx,
      vy: initialSpeedY,
      angle: initialAngle,
      angularVelocity,
      gravity,
      gravityDownScale: typeof gravityDownScale === 'number' ? gravityDownScale : 0.75,
      slashed: false,
      prevVy: initialSpeedY
    };

    // Inisialisasi posisi
    setElementTransformPosition(element, state.x, state.y, state.angle);

    projectiles.push(state);

    // Mulai loop animasi jika belum berjalan
    if (!rafId) {
      lastFrameTimeMs = 0;
      rafId = requestAnimationFrame(stepProjectiles);
    }
  }
  
  function stepProjectiles(timestampMs) {
    if (!lastFrameTimeMs) lastFrameTimeMs = timestampMs;
    const dt = Math.min(0.032, (timestampMs - lastFrameTimeMs) / 1000); // batasi dt
    lastFrameTimeMs = timestampMs;
    
    const toRemove = [];
    
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p || !p.element || p.slashed) continue;
      
      // Integrasi sederhana, perlambat jatuh setelah apex
      if (p.vy < 0) {
        // fase naik
        p.vy += p.gravity * dt;
      } else {
        // fase turun (perlambat sedikit)
        p.vy += (p.gravity * p.gravityDownScale) * dt;
        // opsional: redam horizontal sedikit saat turun
        p.vx *= (1 - 0.02);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angularVelocity * dt;
      
      setElementTransformPosition(p.element, p.x, p.y, p.angle);
      
      // Deteksi apex: ketika kecepatan vertikal melewati 0 (dari negatif ke positif)
      const justPassedApex = p.prevVy < 0 && p.vy >= 0;
      p.prevVy = p.vy;
      
      if (justPassedApex) {
        // Lakukan tebasan tepat di puncak lintasan
        if (p.type === 'bomb') {
          // Tebas bom (vertikal) + suara bom instan
          createSlash(p.element, 3);
          const playedLowLatency = playBombSoundLowLatency();
          if (!playedLowLatency) playBombSound();
          setTimeout(() => {
            // Mungkin elemen sudah terhapus; cek masih terpasang
            if (p.element && p.element.parentNode) {
              explodeBomb(p.element);
            }
          }, 80);
        } else {
          // Buah biasa: tebas dan belah
          createSlash(p.element, p.countdown);
          sliceFruit(p.element);
        }
        p.slashed = true;
        toRemove.push(p);
        continue;
      }
      
      // Hapus jika keluar layar jauh di bawah atau jauh di samping
      const offBottom = p.y > window.innerHeight + 200;
      const offSide = p.x < -200 || p.x > window.innerWidth + 200;
      if (offBottom || offSide) {
        // Bersihkan elemen jika belum terbelah
        if (p.element && p.element.parentNode) {
          p.element.remove();
          fruitElements = fruitElements.filter(f => f !== p.element);
        }
        toRemove.push(p);
      }
    }
    
    if (toRemove.length > 0) {
      projectiles = projectiles.filter(p => !toRemove.includes(p));
    }
    
    if (projectiles.length > 0) {
      rafId = requestAnimationFrame(stepProjectiles);
    } else {
      rafId = null;
      lastFrameTimeMs = 0;
    }
  }
  
  // Konfigurasi buah dengan gambar
  const FRUITS = [
    { type: 'apple', name: 'Apel', imgId: 'apple-img' },
    { type: 'grape', name: 'Anggur', imgId: 'orange-img' },
    { type: 'watermelon', name: 'Semangka', imgId: 'watermelon-img' },
    { type: 'banana', name: 'Pisang', imgId: 'pineapple-img' },
    { type: 'bomb', name: 'Bom', imgId: 'bomb-img' }
  ];
  
  // Efek suara beep
  function playBeep() {
    beepSound.currentTime = 0;
    beepSound.play().catch(e => console.log('Audio play failed:', e));
  }
  
  // Efek suara slash
  function playSlashSound() {
    if (slashSound && slashSound.readyState >= 2) {
      slashSound.currentTime = 0;
      slashSound.play().catch(e => console.log('Slash sound failed:', e));
    } else {
      console.warn('Slash sound belum siap');
    }
  }
  
  // Efek suara bom
  function playBombSound() {
    if (bombSound && bombSound.readyState >= 2) {
      // Mulai dari offset kecil untuk menghindari encoder delay pada MP3
      try {
        bombSound.currentTime = BOMB_SOUND_OFFSET_SEC;
      } catch(_) {
        bombSound.currentTime = 0;
      }
      bombSound.play().catch(e => console.log('Bomb sound failed:', e));
    } else {
      console.warn('Bomb sound belum siap');
    }
  }

  // Prime audio bom agar tidak delay saat pertama kali diputar
  function primeBombAudio() {
    if (!bombSound) return;
    const originalVolume = bombSound.volume;
    try {
      // Prime HTMLAudio: mainkan senyap lalu jeda untuk memanaskan decoder
      bombSound.muted = true;
      bombSound.volume = 0;
      bombSound.currentTime = 0;
      const playPromise = bombSound.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          bombSound.pause();
          bombSound.currentTime = 0;
          bombSound.muted = false;
          bombSound.volume = originalVolume;
        }).catch(() => {
          bombSound.muted = false;
          bombSound.volume = originalVolume;
        });
      } else {
        bombSound.volume = originalVolume;
      }
    } catch (e) {
      bombSound.volume = originalVolume;
    }
    // Prime WebAudio: siapkan context dan buffer
    ensureAudioContext();
    loadBombAudioBuffer();
  }
  
  // Efek suara ledakan (simulasi dengan beep yang lebih panjang)
  function playExplosionSound() {
    // Buat multiple beep untuk efek ledakan
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        beepSound.currentTime = 0;
        beepSound.play().catch(e => console.log('Explosion sound failed:', e));
      }, i * 100);
    }
  }
  
  // Mulai countdown
  function startCountdown() {
    console.log('Countdown dimulai!');
    mainContent.classList.add('hidden');
    countdownScreen.classList.remove('hidden');

    // Play musik background dengan fade in
    if (bgMusic) {
      try {
        bgMusic.currentTime = 0;
        bgMusic.volume = 0;
        bgMusic.play().catch(() => {});
        // Fade in selama 1.5 detik
        let fadeStep = 0;
        const fadeSteps = 15;
        const fadeInterval = setInterval(() => {
          fadeStep++;
          bgMusic.volume = Math.min(0.5, fadeStep / fadeSteps * 0.5);
          if (fadeStep >= fadeSteps) clearInterval(fadeInterval);
        }, 100);
      } catch(_) {}
    }

    currentCountdown = 5;
    countdownNumber.textContent = currentCountdown;

    countdownInterval = setInterval(() => {
      currentCountdown--;

      if (currentCountdown > 0) {
        playBeep();
        countdownNumber.textContent = currentCountdown;
        spawnFruit(currentCountdown);
      } else {
        clearInterval(countdownInterval);
        countdownNumber.textContent = '';
        setTimeout(() => {
          spawnBomb();
        }, 500);
      }
    }, 1000);
  }
  
  // Spawn buah berdasarkan countdown (lintasan parabola + rotasi)
  function spawnFruit(countdown) {
    const fruitType = FRUITS[countdown - 1];
    const fruit = document.createElement('div');
    fruit.className = `fruit ${fruitType.type}`;
    
    // Tambahkan gambar buah
    const img = document.createElement('img');
    img.src = document.getElementById(fruitType.imgId).src;
    img.alt = fruitType.name;
    fruit.appendChild(img);
    
    // Inisialisasi posisi (akan diatur oleh fisika)
    fruit.style.position = 'absolute';
    fruit.style.top = '0px';
    fruit.style.left = '0px';
    fruit.style.transition = 'none';
    fruit.style.transformOrigin = '50% 50%';
    
    fruitContainer.appendChild(fruit);
    fruitElements.push(fruit);
    
    // Target apex: tinggi maksimal sejajar angka (acak arah horizontal)
    const targetRect = countdownNumber.getBoundingClientRect();
    const targetApexY = targetRect.top + targetRect.height / 2;
    const targetApexX = Math.random() * window.innerWidth; // segala arah
    // Tentukan posisi horizontal buah: countdown 5,3,1 di kiri; 4,2 di kanan
    let startX;
    if (countdown % 2 === 1) {
      // Kiri (10% dari lebar layar)
      startX = window.innerWidth * 0.18;
    } else {
      // Kanan (90% dari lebar layar)
      startX = window.innerWidth * 0.82;
    }
    launchProjectile(fruit, { type: fruitType.type, countdown, targetApexX, targetApexY, gravityDownScale: 0.7, initialSpeedX: 0, startX });
  }
  
  // Buat efek tebasan
  function createSlash(fruit, countdown) {
    const slash = document.createElement('div');
    slash.className = 'slash';
    
    const fruitRect = fruit.getBoundingClientRect();
    const centerX = fruitRect.left + fruitRect.width / 2;
    const centerY = fruitRect.top + fruitRect.height / 2;
    
    // Posisi slash tepat di tengah buah/bom
    slash.style.left = (centerX - 100) + 'px';
    slash.style.top = (centerY - 2) + 'px';
    
    // Mainkan suara slash (kecuali untuk bom)
    if (!fruit.classList.contains('bomb')) {
      playSlashSound();
    }
    
    // Arah tebasan berdasarkan countdown
    switch(countdown) {
      case 5: // Horizontal
        slash.style.transform = 'rotate(0deg)';
        break;
      case 4: // Diagonal
        slash.style.transform = 'rotate(45deg)';
        break;
      case 3: // Vertikal
        slash.style.transform = 'rotate(90deg)';
        break;
      case 2: // Ganda
        slash.style.transform = 'rotate(0deg)';
        setTimeout(() => {
          const slash2 = document.createElement('div');
          slash2.className = 'slash';
          slash2.style.left = (centerX - 100) + 'px';
          slash2.style.top = (centerY - 2) + 'px';
          slash2.style.transform = 'rotate(90deg)';
          fruitContainer.appendChild(slash2);
          slashElements.push(slash2);
          // Mainkan suara slash kedua untuk tebasan ganda
          setTimeout(() => playSlashSound(), 50);
          setTimeout(() => slash2.remove(), 300);
        }, 150);
        break;
    }
    
    fruitContainer.appendChild(slash);
    slashElements.push(slash);
    
    setTimeout(() => {
      slash.remove();
      slashElements = slashElements.filter(s => s !== slash);
    }, 300);
  }
  
  // Potong buah menjadi dua bagian
  function sliceFruit(fruit) {
    setTimeout(() => {
      const fruitRect = fruit.getBoundingClientRect();
      const x = fruitRect.left;
      const y = fruitRect.top;
      
      // Buat bagian kiri
      const leftHalf = document.createElement('div');
      leftHalf.className = 'fruit-half left';
      leftHalf.style.left = x + 'px';
      leftHalf.style.top = y + 'px';
      
      const leftImg = document.createElement('img');
      leftImg.src = fruit.querySelector('img').src;
      leftImg.alt = 'Buah kiri';
      leftHalf.appendChild(leftImg);
      
             // Buat bagian kanan
       const rightHalf = document.createElement('div');
       rightHalf.className = 'fruit-half right';
       rightHalf.style.left = (x + 60) + 'px';
       rightHalf.style.top = y + 'px';
      
      const rightImg = document.createElement('img');
      rightImg.src = fruit.querySelector('img').src;
      rightImg.alt = 'Buah kanan';
      rightHalf.appendChild(rightImg);
      
      // Tambahkan ke container
      fruitContainer.appendChild(leftHalf);
      fruitContainer.appendChild(rightHalf);
      
      // Hapus buah asli
      fruit.remove();
      fruitElements = fruitElements.filter(f => f !== fruit);
      
             // Buat efek cipratan jus
       createJuiceSplatter(x + 60, y + 60);
      
      // Animasi gravitasi untuk kedua bagian
      setTimeout(() => {
        leftHalf.style.animation = 'gravityFallLeft 3s ease-in forwards';
        rightHalf.style.animation = 'gravityFallRight 3s ease-in forwards';
        
        // Hapus bagian buah setelah animasi selesai
        setTimeout(() => {
          leftHalf.remove();
          rightHalf.remove();
        }, 3000);
      }, 100);
    }, 100);
  }
  
  // Efek cipratan jus
  function createJuiceSplatter(centerX, centerY) {
    // Buat partikel jus
    for (let i = 0; i < 12; i++) {
      const juice = document.createElement('div');
      juice.style.position = 'absolute';
      juice.style.width = '6px';
      juice.style.height = '6px';
      juice.style.borderRadius = '50%';
      juice.style.backgroundColor = `hsl(${Math.random() * 60 + 0}, 70%, 50%)`;
      juice.style.left = centerX + 'px';
      juice.style.top = centerY + 'px';
      juice.style.pointerEvents = 'none';
      juice.style.zIndex = '14';
      
      // Animasi cipratan dengan gravitasi
      const angle = (i / 12) * Math.PI * 2;
      const distance = 60 + Math.random() * 80;
      const endX = centerX + Math.cos(angle) * distance;
      const endY = centerY + Math.sin(angle) * distance + 100; // Tambah gravitasi
      
      juice.style.transition = 'all 2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      
      fruitContainer.appendChild(juice);
      
      setTimeout(() => {
        juice.style.left = endX + 'px';
        juice.style.top = endY + 'px';
        juice.style.opacity = '0';
        
        setTimeout(() => juice.remove(), 2000);
      }, 50);
    }
  }
  
  // Spawn bom (lintasan parabola + rotasi, tebas di apex)
  function spawnBomb() {
    const bomb = document.createElement('div');
    bomb.className = 'fruit bomb';
    
    // Tambahkan gambar bom
    const img = document.createElement('img');
    img.src = document.getElementById('bomb-img').src;
    img.alt = 'Bom';
    bomb.appendChild(img);
    
    bomb.style.position = 'absolute';
    bomb.style.top = '0px';
    bomb.style.left = '0px';
    bomb.style.transition = 'none';
    bomb.style.transformOrigin = '50% 50%';
    
    fruitContainer.appendChild(bomb);
    fruitElements.push(bomb);
    
    // Pastikan audio siap saat proses berjalan
    if (bombSound && bombSound.readyState < 2) {
      try { bombSound.load(); } catch(_) {}
    }
    
    const targetRect = countdownNumber.getBoundingClientRect();
    const targetApexY = targetRect.top + targetRect.height / 2;
    const targetApexX = Math.random() * window.innerWidth; // segala arah
    // Bom dilempar dari tengah layar
    const startX = window.innerWidth / 2;
    launchProjectile(bomb, { type: 'bomb', countdown: 3, targetApexX, targetApexY, gravityDownScale: 0.7, initialSpeedX: 0, startX });
  }
  
  // Ledakan bom
  function explodeBomb(bomb) {
    // Hapus bom
    bomb.remove();
    fruitElements = fruitElements.filter(f => f !== bomb);

  // Musik tetap menyala sampai selesai (tidak di-pause di sini)

    // Tampilkan layar ledakan
    countdownScreen.classList.add('hidden');
    explosionScreen.classList.remove('hidden');

    // Tambahkan efek getaran
    explosionScreen.classList.add('shake');

    // Buat efek ledakan yang lebih realistis
    createRealisticExplosion();

    // Mainkan suara ledakan
    playExplosionSound();

    // Flash ledakan
    setTimeout(() => {
      explosionOverlay.style.animation = 'explosionFlash 1.5s ease-out';
      setTimeout(() => {
        explosionScreen.classList.add('hidden');
        showFinalMessage();
      }, 2000);
    }, 100);
  }
  
  // Buat ledakan yang lebih realistis
  function createRealisticExplosion() {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Buat gelombang ledakan
    const wave = document.createElement('div');
    wave.className = 'explosion-wave';
    explosionScreen.appendChild(wave);
    
    // Buat shockwave
    const shockwave = document.createElement('div');
    shockwave.className = 'explosion-shockwave';
    explosionScreen.appendChild(shockwave);
    
    // Buat efek debu
    const dust = document.createElement('div');
    dust.className = 'explosion-dust';
    explosionScreen.appendChild(dust);
    
         // Buat partikel api (fire particles)
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle fire';
      
       const size = 6 + Math.random() * 8;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      
       const angle = (i / 20) * Math.PI * 2;
       const distance = 80 + Math.random() * 150;
       const x = Math.cos(angle) * distance;
       const y = Math.sin(angle) * distance;
       
       particle.style.setProperty('--x', x + 'px');
       particle.style.setProperty('--y', y + 'px');
       particle.style.setProperty('--scale', (0.5 + Math.random() * 1.5));
       particle.style.setProperty('--rotate', (Math.random() * 720) + 'deg');
       particle.style.left = centerX + 'px';
       particle.style.top = centerY + 'px';
       
       explosionParticles.appendChild(particle);
       
       setTimeout(() => particle.remove(), 1500);
     }
    
         // Buat partikel asap (smoke particles)
     for (let i = 0; i < 15; i++) {
       const particle = document.createElement('div');
       particle.className = 'particle smoke';
       
       const size = 8 + Math.random() * 12;
       particle.style.width = size + 'px';
       particle.style.height = size + 'px';
       
       const angle = (i / 15) * Math.PI * 2;
       const distance = 60 + Math.random() * 120;
       const x = Math.cos(angle) * distance;
       const y = Math.sin(angle) * distance - 50; // Asap naik ke atas
       
       particle.style.setProperty('--x', x + 'px');
       particle.style.setProperty('--y', y + 'px');
       particle.style.setProperty('--scale', (0.8 + Math.random() * 1.2));
       particle.style.setProperty('--rotate', (Math.random() * 360) + 'deg');
       particle.style.left = centerX + 'px';
       particle.style.top = centerY + 'px';
       
       explosionParticles.appendChild(particle);
       
       setTimeout(() => particle.remove(), 1800);
     }
    
         // Buat partikel percikan (spark particles)
     for (let i = 0; i < 25; i++) {
       const particle = document.createElement('div');
       particle.className = 'particle spark';
       
       const size = 3 + Math.random() * 4;
       particle.style.width = size + 'px';
       particle.style.height = size + 'px';
       
       const angle = (i / 25) * Math.PI * 2;
       const distance = 100 + Math.random() * 200;
       const x = Math.cos(angle) * distance;
       const y = Math.sin(angle) * distance;
       
       particle.style.setProperty('--x', x + 'px');
       particle.style.setProperty('--y', y + 'px');
       particle.style.setProperty('--scale', (0.3 + Math.random() * 0.7));
       particle.style.setProperty('--rotate', (Math.random() * 1080) + 'deg');
       particle.style.left = centerX + 'px';
       particle.style.top = centerY + 'px';
       
       explosionParticles.appendChild(particle);
       
       setTimeout(() => particle.remove(), 1500);
     }
    
         // Hapus elemen efek setelah selesai
     setTimeout(() => {
       wave.remove();
       shockwave.remove();
       dust.remove();
     }, 2000);
  }
  
  // Tampilkan pesan akhir
  function showFinalMessage() {
    finalMessage.classList.remove('hidden');
    // Sakura fall effect
    const sakuraContainer = document.getElementById('sakura-container');
    if (sakuraContainer) {
      for (let i = 0; i < 18; i++) {
        setTimeout(() => {
          const sakura = document.createElement('img');
          sakura.src = 'gambar/sakura.svg';
          sakura.className = 'sakura';
          sakura.style.left = Math.random() * 95 + 'vw';
          sakura.style.top = '-50px';
          sakura.style.animationDuration = (3.5 + Math.random() * 2.5) + 's';
          sakura.style.opacity = (0.7 + Math.random() * 0.3).toString();
          sakuraContainer.appendChild(sakura);
          setTimeout(() => sakura.remove(), 7000);
        }, i * 400);
      }
    }
  }
  
  // Event listener untuk tombol start
  startBtn.addEventListener('click', (e) => {
    console.log('Tombol diklik!');
    e.preventDefault();
    // Prime audio bom agar tidak delay saat digunakan
    primeBombAudio();
    startCountdown();
  });
  
  // Tambahkan event listener untuk touch events (mobile)
  startBtn.addEventListener('touchstart', (e) => {
    console.log('Tombol di-touch!');
    e.preventDefault();
    // Prime audio bom agar tidak delay saat digunakan
    primeBombAudio();
    startCountdown();
  });
  
  // Cleanup saat halaman ditutup
  window.addEventListener('beforeunload', () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
  });
  
  console.log('Event listeners ditambahkan');
  
  // Pastikan audio dimuat dengan benar
  window.addEventListener('load', () => {
    console.log('Audio status:');
    console.log('- Beep sound ready:', beepSound?.readyState >= 2);
    console.log('- Slash sound ready:', slashSound?.readyState >= 2);
    console.log('- Bomb sound ready:', bombSound?.readyState >= 2);
  });
});
