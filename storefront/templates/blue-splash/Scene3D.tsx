import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment, ContactShadows, Float } from '@react-three/drei'
import * as THREE from 'three'

function Model() {
  const meshRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF('/glb/513213-10385.glb')
  const { viewport } = useThree()

  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = child.material.clone()
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.metalness = 0.6
          child.material.roughness = 0.2
        }
      }
    })
    scene.scale.set(1, 1, 1)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 2.5 / maxDim
    const isMobile = viewport.width < 5
    scene.scale.setScalar(isMobile ? scale * 0.9 : scale)
  }, [scene, viewport.width])

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15
    }
  })

  return (
    <Float speed={1} rotationIntensity={0.15} floatIntensity={0.4}>
      <primitive ref={meshRef} object={scene} />
    </Float>
  )
}

export default function Scene3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.4} />
      <spotLight position={[5, 5, 5]} angle={0.3} penumbra={0.8} intensity={1.5} color="#6c5ce7" />
      <spotLight position={[-5, -3, 3]} angle={0.3} penumbra={0.8} intensity={1} color="#00d2ff" />
      <directionalLight position={[0, 5, 0]} intensity={0.3} />
      <Model />
      <ContactShadows
        position={[0, -1.8, 0]}
        opacity={0.3}
        scale={6}
        blur={2.5}
        far={3}
      />
      <Environment preset="city" />
    </Canvas>
  )
}
