import Module from './module'
import { assert, forEachValue } from '../util'


  /*{
      
        modules:{
          a:{
            modules:{
              c:{}
            }
          },
          b:{}
        }
    }
    */


//!返回数据结构实例 整体是src/module/module.js中Module的实例组成树形结构
/*
{
  root：{
      runtime,
      state:rawModule.state,
      _rawModule:rawModule,
      namespaced:rawModule.namespaced
      _children:{
        a:{
          runtime,
          state:aRawModule.state,
          _rawModule:aRawModule,
          namespaced:aRawModule.namespaced,
          _children:{
            c:{
              runtime,
              state:cRawModule.state,
              _rawModule:cRawModule,
              namespaced:cRawModule.namespaced
              _children:{
              }
            }
          }
        },
        b:{
          runtime,
          state:bRawModule.state,
          _rawModule:bRawModule,
          namespaced:bRawModule.namespaced,
          _children:{
          }
        }
      }

  }
}
*/
export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }


  // 根据给定的路径从根模块依次找到path数字的字后最后一个所生成的module 
  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

   // 格局path数组 获取完整的命令空间,根节点返回的是''
   // 子节点返回的是a/c  
  getNamespace (path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      //明明空间的 namespaced属性 才决定是否 加 "key+/"
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  // 更新整个根模块，同时递归更新子模块
  update (rawRootModule) {
    update([], this.root, rawRootModule)
  }

  // 注册模块，递归注册子模块
  register (path, rawModule, runtime = true) {
    // rawModule 就是 new Vuex.Store 中的参数  {state,mutations,getters....}

    if (__DEV__) {
      assertRawModule(path, rawModule)
    }


    const newModule = new Module(rawModule, runtime)
    // {
    //   runtime
    //   state:rawModule.state,
    //   _rawModule:rawModule,
    //   namespaced:rawModule.namespaced
    // }
    if (path.length === 0) {
      // 根模块，new ModuleCollection时候创建见根 
      this.root = newModule
    } else {
      // 注册子模块了
       // 根据指定的path找到对应的模块，给模块注册子模块（key，moule）
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
  
    // 子模块存在注册子模块
    if (rawModule.modules) {
        
      // 对modules对象的keys进行遍历，执行第二个回调函数，把key对应的value和key作为函数的第一个参数和第二个参数
      forEachValue(rawModule.modules, (rawChildModule, key) => {
         //模块注册的时候，使用的是数组字符串 [a,b,c...],而不能是 a/b/c/...
         // 递归注册子模块，path为父节点的完整路径，父节点的完整路径拼接上子模块的名字作为新的路径
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  //卸载某个指定路径的模块
  unregister (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    const child = parent.getChild(key)

    if (!child) {
      if (__DEV__) {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        )
      }
      return
    }

    if (!child.runtime) {
      return
    }

    parent.removeChild(key)
  }

   //判断某个命名空间是否被注册过 ，先找到父亲，然后再在父亲的儿子中找最后一个key是否存在
  isRegistered (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]

    if (parent) {
      return parent.hasChild(key)
    }

    return false
  }
}

// 更新的模块在原来的模块不存在，则不会至此那个更新
function update (path, targetModule, newModule) {
  if (__DEV__) {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      // 新模块里面有,老的模块里面不存在，则不执行
      if (!targetModule.getChild(key)) {
        if (__DEV__) {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          )
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
  }
}



// 以下函数不重要主要是开发环境的一些警告报错之类的

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

function assertRawModule (path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

function makeAssertionMessage (path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
