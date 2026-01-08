
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
    this.visemeTimeouts = [];
    this.audioStartTime = 0;

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
        
        // Find head mesh for morph targets and armature
        let armature = null;
        this.avatar.traverse((child) => {
          if (child.isMesh && child.morphTargetDictionary) {
            this.headMesh = child;
          }
          if (child.isObject3D && child.type === 'Bone' && child.name === this.opt.modelRoot) {
            armature = child;
          }
        });

        // Setup mixer
        this.mixer = new THREE.AnimationMixer(this.avatar);
        this.mixers.push(this.mixer);

        // Initialize dynamic bones if armature found
        if (armature) {
          try {
            // Basic hair and body bone configuration for Ready Player Me avatars
            const dynamicBonesConfig = [
              // Hair bones (if present)
              { bone: 'Head', type: 'link', stiffness: 5, damping: 0.5, external: 0.5 },
            ];
            
            // Filter to only include bones that exist
            const filteredConfig = dynamicBonesConfig.filter(config => {
              return armature.getObjectByName(config.bone) !== null;
            });
            
            if (filteredConfig.length > 0) {
              this.dynamicBones.setup(this.scene, armature, filteredConfig);
            }
          } catch (e) {
            console.warn('Could not setup dynamic bones:', e);
          }
        }

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
        
        // Initialize audio start time
        this.audioStartTime = this.audioCtx.currentTime;
    }
    
    if (this.audioWorkletNode) {
        this.audioWorkletNode.port.postMessage({
            type: 'audioData',
            data: data.audio
        });
    }

    // Process Visemes with proper timing based on audio context
    if (data.words && data.words.length > 0) {
        const text = data.words.join(' ');
        const lipsync = this.lipsync.wordsToVisemes(text);
        
        // Calculate audio latency and buffer offset
        const audioBufferDelay = 0.05; // Small buffer for worklet processing
        const scheduleTime = this.audioCtx.currentTime + audioBufferDelay - this.audioStartTime;
        
        // Schedule visemes to match audio timing
        this.playVisemes(lipsync, scheduleTime);
    }
  }

  playVisemes(lipsync, scheduleOffset = 0) {
    // Clear any pending viseme timeouts
    this.visemeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.visemeTimeouts = [];
    
    this.isSpeaking = true;
    
    // Schedule visemes with proper timing
    lipsync.visemes.forEach((viseme, i) => {
        const timeout = setTimeout(() => {
            this.setViseme(viseme);
        }, (lipsync.times[i] + scheduleOffset) * 1000);
        this.visemeTimeouts.push(timeout);
    });

    // End speaking state
    const totalDuration = lipsync.times[lipsync.times.length - 1] + lipsync.durations[lipsync.durations.length - 1];
    const endTimeout = setTimeout(() => {
        this.setViseme('sil');
        this.isSpeaking = false;
    }, (totalDuration + scheduleOffset) * 1000);
    this.visemeTimeouts.push(endTimeout);
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

  stopSpeaking() {
    // Clear any pending viseme animations
    this.visemeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.visemeTimeouts = [];
    
    // Reset viseme to silence
    this.setViseme('sil');
    this.isSpeaking = false;
    
    // Reset audio timing
    if (this.audioCtx) {
      this.audioStartTime = this.audioCtx.currentTime;
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.mixers.forEach(mixer => mixer.update(delta));
    
    // Subtle idle head movement - reduced amplitude for stability
    if (this.avatar) {
        const moveScale = this.isSpeaking ? this.opt.avatarSpeakingHeadMove : this.opt.avatarIdleHeadMove;
        const time = this.clock.getElapsedTime();
        
        // Reduced rotation for more stability - make movements slower and smaller
        this.avatar.rotation.y = Math.sin(time * 0.3) * 0.02 * moveScale;
        this.avatar.rotation.x = Math.sin(time * 0.2) * 0.01 * moveScale;
        
        // Add very subtle Z rotation for natural breathing effect
        this.avatar.rotation.z = Math.sin(time * 0.25) * 0.005 * moveScale;
    }

    // Update dynamic bones for natural body physics
    if (this.dynamicBones && this.dynamicBones.running) {
        this.dynamicBones.update(delta * 1000);
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    // Clear any pending viseme timeouts
    this.visemeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.visemeTimeouts = [];
    
    this.renderer.dispose();
    this.nodeAvatar.removeChild(this.renderer.domElement);
    if (this.audioCtx) this.audioCtx.close();
    if (this.dynamicBones) this.dynamicBones.dispose();
    this.resizeObserver.disconnect();
  }
}

export { TalkingHead };