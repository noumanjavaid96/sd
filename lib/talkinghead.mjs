
/**
* MIT License
*
* Copyright (c) 2024 Mika Suominen
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { DynamicBones } from './dynamicbones.mjs';
import { LipsyncEn } from './lipsync-en.mjs';
import { LipsyncFi } from './lipsync-fi.mjs';
import { LipsyncLt } from './lipsync-lt.mjs';
import { LipsyncDe } from './lipsync-de.mjs';
import { LipsyncFr } from './lipsync-fr.mjs';

const workletUrl = new URL('./playback-worklet.js', import.meta.url);

class TalkingHead {
  nodeAvatar;
  opt;
  scene;
  camera;
  renderer;
  clock;
  mixers;
  audioCtx;
  audioWorkletNode;
  lipsync;
  controls;
  dynamicBones;
  resizeObserver;
  isSpeaking;
  visemeTarget;
  visemeDuration;
  visemeTimer;
  avatar;
  headMesh;
  mixer;

  constructor(node, opt = null) {
    this.nodeAvatar = node;
    this.opt = Object.assign({
      lipsyncLang: 'en',
      modelRoot: "Armature",
      modelPixelRatio: 1,
      cameraView: 'upper',
      avatarMood: "neutral",
      avatarIdleEyeContact: 0.2,
      avatarIdleHeadMove: 0.5,
      avatarSpeakingEyeContact: 0.5,
      avatarSpeakingHeadMove: 0.5,
    }, opt || {});

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe0e0e0);
    this.camera = new THREE.PerspectiveCamera(25, node.clientWidth / node.clientHeight, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(node.clientWidth, node.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio * this.opt.modelPixelRatio);
    node.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.mixers = [];
    this.audioCtx = null;
    this.audioWorkletNode = null;
    this.lipsync = new LipsyncEn(); // Default to English

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 1, 1);
    this.scene.add(dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.target.set(0, 1.4, 0);

    // Dynamic bones setup
    this.dynamicBones = new DynamicBones();
    
    // Resize handler
    this.resizeObserver = new ResizeObserver(() => {
        this.camera.aspect = node.clientWidth / node.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(node.clientWidth, node.clientHeight);
    });
    this.resizeObserver.observe(node);

    this.isSpeaking = false;
    this.visemeTarget = null;
    this.visemeDuration = 0;
    this.visemeTimer = 0;

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  async showAvatar(cfg) {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    loader.setDRACOLoader(dracoLoader);

    return new Promise((resolve, reject) => {
      loader.load(cfg.url, (gltf) => {
        this.avatar = gltf.scene;
        this.scene.add(this.avatar);
        
        // Find head mesh for morph targets
        this.avatar.traverse((child) => {
          if (child.isMesh && child.morphTargetDictionary) {
            this.headMesh = child;
          }
        });

        // Setup mixer
        this.mixer = new THREE.AnimationMixer(this.avatar);
        this.mixers.push(this.mixer);

        // Adjust camera
        const box = new THREE.Box3().setFromObject(this.avatar);
        const center = box.getCenter(new THREE.Vector3());
        this.controls.target.copy(center);
        this.controls.target.y += 0.1; // adjust for upper view
        
        if (this.opt.cameraView === 'upper') {
            this.camera.position.set(0, 1.6, 1.2); 
        } else {
            this.camera.position.set(0, 1.4, 2.5);
        }
        this.controls.update();

        resolve(null);
      }, undefined, reject);
    });
  }

  async streamAudio(data) {
    // data: { audio: ArrayBuffer, words: string[], wtimes: number[], wdurations: number[] }
    if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window['webkitAudioContext'])({ sampleRate: 24000 });
        await this.audioCtx.audioWorklet.addModule(workletUrl);
        this.audioWorkletNode = new AudioWorkletNode(this.audioCtx, 'playback-worklet');
        this.audioWorkletNode.connect(this.audioCtx.destination);
    }
    
    if (this.audioWorkletNode) {
        this.audioWorkletNode.port.postMessage({
            type: 'audioData',
            data: data.audio
        });
    }

    // Process Visemes locally for now since we have text
    if (data.words && data.words.length > 0) {
        const text = data.words.join(' ');
        const lipsync = this.lipsync.wordsToVisemes(text);
        
        // Push visemes to a queue (simplified for streaming)
        // In a real implementation, you'd sync this with audio time
        // Here we just play them with a small offset to match audio latency
        this.playVisemes(lipsync);
    }
  }

  playVisemes(lipsync) {
    this.isSpeaking = true;
    
    // Simple loop to apply visemes
    // This is a placeholder for a robust scheduler
    let offset = 0.1; // latency compensation
    lipsync.visemes.forEach((viseme, i) => {
        setTimeout(() => {
            this.setViseme(viseme);
        }, (lipsync.times[i] + offset) * 1000);
    });

    // End speaking state
    const totalDuration = lipsync.times[lipsync.times.length -1] + lipsync.durations[lipsync.durations.length -1];
    setTimeout(() => {
        this.setViseme('sil');
        this.isSpeaking = false;
    }, (totalDuration + offset) * 1000);
  }

  setViseme(viseme) {
    if (!this.headMesh || !this.headMesh.morphTargetDictionary) return;
    
    // Reset all visemes
    const visemeNames = ['aa', 'E', 'I', 'O', 'U', 'PP', 'SS', 'DD', 'FF', 'kk', 'nn', 'RR', 'sil'];
    visemeNames.forEach(v => {
        const idx = this.headMesh.morphTargetDictionary[`viseme_${v}`];
        if (idx !== undefined) this.headMesh.morphTargetInfluences[idx] = 0;
    });

    if (viseme !== 'sil') {
        const idx = this.headMesh.morphTargetDictionary[`viseme_${viseme}`];
        if (idx !== undefined) this.headMesh.morphTargetInfluences[idx] = 1;
    }
  }

  setMood(mood) {
      this.opt.avatarMood = mood;
      // Implement mood-based morph targets (smile, etc.) if available
      if (this.headMesh && this.headMesh.morphTargetDictionary) {
          const smileIdx = this.headMesh.morphTargetDictionary['mouthSmile'];
          if (smileIdx !== undefined) {
              this.headMesh.morphTargetInfluences[smileIdx] = mood === 'happy' ? 0.3 : 0;
          }
      }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.mixers.forEach(mixer => mixer.update(delta));
    
    // Idle head movement
    if (this.avatar) {
        const moveScale = this.isSpeaking ? this.opt.avatarSpeakingHeadMove : this.opt.avatarIdleHeadMove;
        const time = this.clock.getElapsedTime();
        this.avatar.rotation.y = Math.sin(time * 0.5) * 0.05 * moveScale;
        this.avatar.rotation.x = Math.sin(time * 0.3) * 0.02 * moveScale;
    }

    if (this.dynamicBones) {
        this.dynamicBones.update(delta * 1000);
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.nodeAvatar.removeChild(this.renderer.domElement);
    if (this.audioCtx) this.audioCtx.close();
    this.resizeObserver.disconnect();
  }
}

export { TalkingHead };