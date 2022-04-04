import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert, partial } from './util'

let Vue // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    if (__DEV__) {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `store must be called with the new operator.`)
    }

    const {
      plugins = [],
      strict = false
    } = options

    // store internal state
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []//  subscribeAction注册函数存放队列，默认是action执行之前执行，
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    // 根据命名空间存放module {a:moduleA,b:moduleB}
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []  //  subscribe注册的函数队列
    this._watcherVM = new Vue()
    this._makeLocalGettersCache = Object.create(null)  //makeLocalGetters方法在设置值

    // bind commit and dispatch to self
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict

//! this._modules的数据结构类型；
//返回数据结构实例 整体是src/module/module.js中Module的实例组成树形结构
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
    // 这里的state 也仅仅是第一层的state；
    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters

    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    // 此时的this是没有_vm属性，经过resetStoreVM创建了 _vm 属性，是一个Vue实例
    // 响应式state和_wrappedGetters
    // 此时的经过 installModule函数的处理state结构
    // {
    //   ...rawModule.state
    //   a:{
    //     ...aRawModule.state,
    //     c:{...cRawModule.state}
    //   }
    //   b:{
    //    ...bRawModule.state
    //   }
    // }

    // _wrappedGetters结构,aG为a模块的getters中的aG属性和属性对应的值都为aG表示
    // {
    // a/aG:aG,
    // a/c/cG:cG
    // b/bG:bG
    // }
    //
    console.log('JSON.stringify(state): ', JSON.stringify(state));
    resetStoreVM(this, state)

    //todotodototototo======>
    // apply plugins
    plugins.forEach(plugin => plugin(this))

    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  get state () {
    return this._vm._data.$$state
  }

  set state (v) {
    if (__DEV__) {
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }

  commit (_type, _payload, _options) {
    // check object-style commit
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }
    const entry = this._mutations[type] 
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })

    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state))

    if (
      __DEV__ &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }

  dispatch (_type, _payload) {
    // check object-style dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }
    const entry = this._actions[type]
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (__DEV__) {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }

    // 同名的多次注册的action ，返回的是一个存放action的结果数组，只注册一次返回的执行的结果
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)

    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in after action subscribers: `)
            console.error(e)
          }
        }
        resolve(res)
      }, error => {
        try {
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in error action subscribers: `)
            console.error(e)
          }
        }
        reject(error)
      })
    })
  }

  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }

  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  watch (getter, cb, options) {
    if (__DEV__) {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    this._modules.register(path, rawModule)
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters...
    resetStoreVM(this, this.state)
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    this._modules.unregister(path)
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    resetStore(this)
  }

  hasModule (path) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    return this._modules.isRegistered(path)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

   // 临时改变_committing状态，执行fn函数后还原_committing状态
  _withCommit (fn) {
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

function genericSubscribe (fn, subs, options) {
  if (subs.indexOf(fn) < 0) {
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}


/**
 * 将state响应式
 * 重置传入stroe的_vm属性（_vm为new Vue）,其实传入的 store就是根Store
 * @param {*} store
 * @param {*} state
 * @param {*} hot
 * @desc  给传入进来的store根据state创创建_vm 属性的vue实例，
 * 同时访问 store的getters的属性时候相当于访问_vm的属性，形成响应式
 */
function resetStoreVM (store, state, hot) {
  //第一次执行没有该属性，
  const oldVm = store._vm  

  // bind store public getters
  store.getters = {}
  // reset local getters cache
  //清空缓存 makeLocalGetters函数创建的命名空间结果存储对象_makeLocalGettersCache
  store._makeLocalGettersCache = Object.create(null)
  const wrappedGetters = store._wrappedGetters
  const computed = {}

  //  对 wrappedGetters执行 第二个函数操作，函数的参数分别是wrappedGetters的key对应的值，和key
  //  wrappedGetters ={a:aGetter} (aGetter,key)
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    //! computed[key] =function(){
    //    fn(store)
    //  }

    // computed[a] = function(){ aGetter(store) } //这里的store只是一个形参
    computed[key] = partial(fn, store) // 

    // 获取getters对象的key属性值时候，就相当于或者的_vm的对应key属性值
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key], // 从
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  //?! 临时改变 silent属性 执行new Vue（）
  //?! 为什么临时改变，暂时开不知道
  Vue.config.silent = true
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  // options.strict 存在时候参会执行
  if (store.strict) {
    enableStrictMode(store)
  }

  // 在执行resetStoreVM之前  传入进来的store有_vm实例，先卸载掉旧的，因为不管如果都会重新创建_vm实例
  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}

function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length
  //
  const namespace = store._modules.getNamespace(path) // g
  console.log('namespace: ', path, namespace );

  // register in namespace map
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`)
    }
    //? 给store上的_modulesNamespaceMap
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  if (!isRoot && !hot) {
    // 找到path的导数第二个值得state2，然后把导数第一个值val1得state1注册到state2,state2[val1]= state1
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      if (__DEV__) {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          )
        }
      }
      // 找到父亲的state ，然后给父state加上子模块命名空间的state ：a的state:{b:bState}
      Vue.set(parentState, moduleName, module.state)
    })
  }
  // local  返回对应命名空间 {dispatch,commit,getters,state}
  const local = module.context = makeLocalContext(store, namespace, path)


  /**
   * 对 module.mutations 执行传入的函数
   * mutations对象为{a:aMutation,b:bMutation}
   * （aMutation,a）=>{
   *  const namespacedType = namespace + key
      registerMutation(store, namespacedType, aMutation, local)
   * }

      // !给全局的store._mutations[namespacedType]=[mutation] 
      //! 如果a子模块的mutations对象为{a:aMutation,b:bMutation}，则
      //! store._mutations[a/a]=[aMutationHandler];
      //! store._mutations[a/b]=[bMutationHandler]
      //! aMutationHandler和bMutationHandler的仅支持一个参数（是在commit调用时候传入的参数payload），
      //! aMutationHandler在调用的时候也会调用aMutation，aMutation(aState,payload)
      aState就是子模块a的state，payload就是传入的数据也就是我们写的mutation的第二个参数
   * 
   */
   
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

 /**
   * 对 module.actions 执行传入的函数
   * actions对象为{a:aAction}
   * aAction可以是一个对象，里面有root属性和handler，或者是一个函数
   * （aAction,a）=>{
   *  const type = aAction.root ? key : namespace + key
      const handler = aAction.handler || aAction
      registerAction(store, type, handler, local)
   * }

      //! 给全局的store._actions[type]=[action] 
      //! 如果a子模块的 actions 对象为{a:aActions,}，则
      //! store._actions[a/a]=[aActionsHandler] ，命名空间里面存的是个action数组;
      //! aActionsHandler中会执行aAction函数，aActionsHandler函数仅支持传入一个参数。
      //! aAction的参数分别是 有两个,第一个是{
      //! dispatch: local.dispatch,
      //! commit: local.commit,
      //! getters: local.getters,
      //! state: local.state,
      //! rootGetters: store.getters,
      //! rootState: store.state
      //! };
      //! 所有我们在调用action时候可以从第一个参数里面结构处 commit，dispatch对象，可以进行commit提交，或者发起新的dispath
      第二个参数是 aActionsHandler调用时候传过来的载荷,我们调用dispatch时候传入的载荷
      //!aAction执行的最终结果会是Promise对象
      如果，aMutation执行的结果非，promise则使用Promise.resolve包装结果
   * 
   */


  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key

    //
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })



 /**
   * 对 module.getters 执行传入的函数
   * 模块的getters对象为{a:aGetters}
   * aActions可以是一个对象，里面有root属性和handler，或者是一个函数
   * （(aGetters, a) => {
      const namespacedType = namespace + a
      registerGetter(store, namespacedType, aGetters, local)
    }

      给全局的store._wrappedGetters[type]=[aGetters] 
      如果a子模块的 actions 对象为{a:aGetters,}，则
      store._wrappedGetters[a/a]= aGettersHandler ，命名空间里面存的是个getters函数;
      aGettersHandler函数执行时候在会执行aGetters(aState,aGetters,rootState,rootGetters)
      //!aState,aGetters,rootState,rootGetters这里就是我们写的getters时候四个参数：
      //!当前子模块的state，当前子模块的getters，根模快的state，更模块的geeters
   * 
   */
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })
  /*
    *
    //! 递归对每个module._children 对象执行installModule方法，进一步注册 mutations、actions、getters
    //! 同时会在makeLocalContext函数中处理子模块的 dispatch、commit、getters和state属性
    //! 同时补全 
   store._makeLocalGettersCache: 根据getter的命名空间缓存geeter结果 ，主要是 makeLocalContext函数中计算了getter的结果；
   store._mutations: 根据mutation的命名空间 存放mutation数组
   store._actions: 根据action的命名空间 存放ction数组
   stroe._wrappedGetters: 根据geeter的命名空间存放geeter函数
   *
  */
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 * 
 * 根据命名空间找到对应dispatch和 commit，返回
 * {
 * }
 */
/**
 * 
 * @param {*} store  就是真个store
 * @param {*} namespace 命名空间 a/c //?! 这里待考证
 * @param {*} path  完整 path数组[a,c]
 * @returns 返回对应命名空间 {dispatch,commit,getters,state}
 */

function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === '' // 根节点

  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (__DEV__ && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (__DEV__ && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }

      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // 定义了getters 和 state
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

/**
 * 
 * @param {*} store 全局的store
 * @param {*} namespace  "a/c"
 * @returns  返回 'a/c'的getters
 * @des 通过制定命名的空间，返回geteers,同时全局缓存_makeLocalGettersCache中
 */
function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      // namespace为 a/c 截取下标3的（从c后面的/处开始）后半段，如'a/c/cG',最终是cG
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      // 通过cG访问 store.getters['a/c/cG']
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    store._makeLocalGettersCache[namespace] = gettersProxy
  }
  //全局缓存_makeLocalGettersCache
  return store._makeLocalGettersCache[namespace]
}

function registerMutation (store, type, handler, local) {

 // 模块的mutatoin根据 
  const entry = store._mutations[type] || (store._mutations[type] = [])
  entry.push(function wrappedMutationHandler (payload) {
     // 参数局部state 和 传入的载荷参数
    handler.call(store, local.state, payload)
  })
}

function registerAction (store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}

function registerGetter (store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (__DEV__) {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

// 给定state，拿state对顶的path数组命名的[a,b]的state 相当于读取，state.a.b
function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

/**
 * 
 * @param {String||Object} type 
 * @param {*} payload 
 * @param {*} options 
 * @returns {type,payload,options}
 * @desc 如果type是对象 ，返回{type:type.type,payload:type,options:payload},否则直接返回{type,payload,options}
 */
function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (__DEV__) {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options }
}

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
