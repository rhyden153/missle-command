/** A small Web Audio graph recorder for lifecycle and scheduling regression tests. */
export function installAudioHarness({ pending=false, fail=false }={}) {
  const previousContext=globalThis.AudioContext, previousFetch=globalThis.fetch
  const commands=[], nodes=[], requests=[], contexts=[]
  let nextId=0
  class Param {
    value=0
    constructor(id){this.id=id}
    setValueAtTime(...args){commands.push(['set',this.id,...args])}
    exponentialRampToValueAtTime(...args){commands.push(['ramp',this.id,...args])}
  }
  class Node {
    constructor(kind){this.kind=kind;this.id=nextId++;this.outputs=new Set();this.onended=null;nodes.push(this)}
    connect(target){this.outputs.add(target);commands.push(['connect',this.id,target.id])}
    disconnect(){this.outputs.clear();commands.push(['disconnect',this.id])}
    start(...args){commands.push(['start',this.kind,this.id,this.type??null,this.buffer?.id??null,...args])}
    stop(...args){commands.push(['stop',this.id,...args])}
  }
  globalThis.AudioContext=class {
    currentTime=0
    sampleRate=32
    state='running'
    destination={id:'destination'}
    constructor(){contexts.push(this)}
    createGain(){const node=new Node('gain');node.gain=new Param(`gain-${node.id}`);return node}
    createBuffer(channels,length){const samples=new Float32Array(length);return {id:'noise',duration:1,getChannelData:()=>samples}}
    createBufferSource(){return new Node('buffer')}
    createOscillator(){const node=new Node('oscillator');node.frequency=new Param(`frequency-${node.id}`);return node}
    createBiquadFilter(){const node=new Node('filter');node.frequency=new Param(`frequency-${node.id}`);return node}
    decodeAudioData(data){return Promise.resolve({id:new TextDecoder().decode(data),duration:2})}
    resume(){this.state='running';return Promise.resolve()}
    close(){this.state='closed';return Promise.resolve()}
  }
  globalThis.fetch=(url,{signal}={})=>new Promise((resolve,reject)=>{
    commands.push(['fetch',url])
    const request={url,signal,resolve:()=>resolve({ok:!fail,arrayBuffer:async()=>new TextEncoder().encode(url).buffer})}
    requests.push(request)
    signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})
    if(!pending)request.resolve()
  })
  return {commands,nodes,requests,contexts,restore(){globalThis.AudioContext=previousContext;globalThis.fetch=previousFetch}}
}
