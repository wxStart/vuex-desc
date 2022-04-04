# Vuex源码学习

## 入口文件 src/index.cjs.js

```
export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
}

```

### install 方法说明

+ Vue.use(Vuex)时候就会调用install，但是install是先执行，然后Vue实例是后执行，所以利用mixin混入生命周期来执行一些后续才执行的代码。   

+ install里面在Vue的v2版本使用的mixin混入，在beforeCreate这个生命周期中给每个Vue的实例挂载$store属性，所有每个实例都可以通过

+ options.store 是根实例才有的属性，非根实例，就需要用option.parent.$store 属性。刚好利用了beforeCreate的生命周期，父beforeCreate执行后，子beforeCreate执行，所以父亲肯定有$store属性，保证了顺序。


### Store类 的说明


使用一下参数作为options参数作为Store类的参数
```
const modules = {
  moduleA:{
    namespaced:true, 
    //!namespaced:true,子模块必须有这个属性  才会返回 moduleA +'/' +key ,否则都是直接使用key
    state:{ a : 'aaa' };
    getters:{
      aG:function aG(aState,aGetters,rootState,rootGetters){
        return  (rootGetters.rootGetterB + aState.a)
      }
    },
    mutations:{
      aM:function aM(aState,data){
        aState.a = data
      }
    }
    actions:{
       aAtion: async function aAtion({commit,dispatch,}={ 
            dispatch: moduleAdispatch, // moduleA的 dispatch
            commit: moduleAcommit, // moduleA的 commit
            getters: rootGetters,
            state: rootState,
            rootGetters: rootGetters,
            rootState: rootState
      }){
          commit('rootMutationA','aaaa')
        }
    }
  }
}

const options =  {
      state:{rootStateA:'rootA'},
      getters:{
        rootGetterB:function rootGetterB(
          rootState,rootGetters, rootState,rootGetters
          ){
           return rootState.rootStateA;
        }
      }
      mutations:{
        rootMutationA:function rootMutationA(rootState,payload){
          rootState.rootState = payload
        }
      }
      actions:{
        rootActionA: async function rootActionA({commit,dispatch,}={ 
            dispatch: rootDispatch, // 根模块的 dispatch
            commit: rootCommit,   // 根模块的 commit
            getters: rootGetters,
            state: rootState,
            rootGetters: rootGetters,
            rootState: rootState
      }){
          commit('rootMutationA','aaaa')
        }
      },
      // 子模块a
      modules
     };

const store =  new Vuex.Store(options);


```
在执行 ```new Vuex.Store(options)``` 创建store实例：

在构造函数中会创建一些属性，如下:

+  _committing  是一个状态值，表示是否在执行commit操作，默认是false，为true时候表示正在执行某个mutation的操作。 
+  _actions  是一个根据命名和命名空间对应的处理action函数wrappedActionHandler函数的数组的映射关系的对象，方便快速找到指定type对应的actions
```

_actions = {
  rootActionA: [
    /* wrappedActionHandler会把我们给的 rootActionA包装一下；
       在执行dispatch时候会执行， wrappedActionHandler时候执行真是的rootActionA;
       同时将 当前模块的dispatch、commit、getters、state，以及根模块的 rootGetters和
       rootState组成个对象，作为第一个参数,在执行dispatch，会传入数据payload，作为第二个参数 。然后执行我们options模板中写的rootActionA函数的操作
    */
    function wrappedActionHandler(payload){
      rootActionA.call(store,
        {
        dispatch: local.dispatch, // root的local就是store
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state
      }, 
      payload)
    }
  ],
  a/aAtion:[ //如果moduleA的namespaced是false，则a/aAtion就是aAtion
    // 解释说明同上
    function wrappedActionHandler(payload){
      aAtion.call(store,
        {
        dispatch: local.dispatch, // local就是moduleA
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state
      }, 
      payload)
    }
  ]
}
```


+  _mutations 是一个根据命名和命名空间对应的处理mutation函数的映射关系的对象，方便快速找到指定type对应的mutaions

```
_mutations = {
  rootMutationA: [
    /* wrappedMutationHandler会把我们给的 rootMutationA包装一下；
       在执行commit时候会执行， wrappedMutationHandler时候执行真是的rootMutationA;
       同时将 当前模块的state，作为第一个参数,在执行commit，会传入数据payload，作为第二个参数，然后执行我们options模板中写的rootMutationA函数的操作
    */
    function wrappedMutationHandler(payload){
      rootMutationA.call(store,rootState, payload)
    }
  ],
  a/aM:[  //如果moduleA的namespaced是false，则a/aM就是aM
    // 解释说明同上
    function wrappedActionHandler(payload){
      aM.call(store, aState, payload)
    }
  ]
}
```

+ _modules  说明  
它是一个ModuleCollection类的实例，把``` new Vuex.Store(options) ```中的options作为ModuleCollection的参数进行实例化 ```new ModuleCollection(options) ```   
执行后的结果如下：
```
_modules = {
 root:{
   runtime:false,
   state：{ rootStateA:'rootA'}, //
   _rawModule: options, //就是传入的options
   _children:{
     moduleA:{
       runtime:false,
       state:{a : 'aaa' },
       _rawModule: moduleA,
       _children: {}
     }
   },
 }
}

```

+ _modulesNamespaceMap 

根据命名空间存放 module ，只有```namespaced为真 ```才会被放入这个对象中;
因为 options的namespaced为false所以不存放
```
_modulesNamespaceMap ={
  moduleA:_modules.root._children.moduleA
}
```

+ _wrappedGetters  

根据命名空间存放包装getter后的处理函数 wrappedGetter
```
_wrappedGetters ={
  // 这里的store就是store实例，也是根模块
  rootGetterB:function wrappedGetter(store){
    return  rootGetterB( 
        rootState, // 当前模块的 state
        rootGetters, // 当前模块getters
        store.state , //  rootState
        store.getters  //  rootGetters 
        )

  }
  moduleA/aG: function wrappedGetter(store){
    return aG( 
      aState, // 当前模块moduleA的 state
      aGetters, // 当前模块moduleA的getters
      store.state , //  rootState
      store.getters  //  rootGetters
      )
  }
}
```

+ _vm 属性
_vm 是一个vue实例,computed是根据 _wrappedGetters对象生成的。
```
computed ={
  // 就是我们写options里面的rootGetterB函数
  rootGetterB : _wrappedGetters[rootGetterB](store) ,
  moduleA/aG : _wrappedGetters[moduleA/aG](store) 

}
_vm  =new Vue({
  data:{
     $$state: state // 这里的state就是，处理过的所有state的一个对象。
  }
  computed
})
```

+ getters 对象
存放的是根据命名空间的访问的属性key和value， key是命名，value是通过代理方位了store._vm[key];

```
  getters ={
    rootGetterB:{
      get(){
        return store_vm['rootGetterB']
      }
    },
    'moduleA/aG':{
      get(){
        return store_vm['moduleA/aG']
      }
    },
  }

```


+ _makeLocalGettersCache  
根据命名空间，缓存子模块的计算属性结果，仅在访问子模块的计算属性（getter）时候才进行缓存结果，最终是根据命名空间访问了store.getters，同时 store.getters访问的是 store._vm ,_vm是一个vue实例。所以访问 getters里面的属性就是响应式的了。

```
_makeLocalGettersCache ={
  moduleA/aG: {
    aG:{
        get(){
        return  store.getters['moduleA/aG']
        /*
        store.getters['moduleA/aG']:{
        get(){
          return  store._vm['moduleA/aG']
        }
        }
        */
      }
    }
  }
}
```

+ state  
所有的state的集合，访问时候实际上访问的的是 ``` this._vm._data.$$state ```;在对模块执行installModule时候，对所有的模块处理生成state的结构如下：
```
  // 初始值
  // state ={rootStateA:'rootA'}
  // 具体的实现代码
  state = this._modules.root.state;
  // installModule函数中每次根据传入的路径path数组
  /* path.slice(0, -1),从第一位截取到非追后一位，根据截取的path找到父state，然后在父state中追加子state，key为path的最后一位，非根节点才会执行这个 追加子state；
  
  对于子模块moduleA的path为['moduleA']
  moduleA的父节点state就是根模块的state；
  
  */
  
  //state['moduleA'] =aState;
  // 具体的实现代码
  Vue.set(parentState, moduleName, module.state)


  //最终 state的值为
state ={
  rootStateA:'rootA', //这里是根state
  moduleA: { a : 'aaa' } // 这里是模块moduleA的state
  }

```
  
+ _subscribers 
store.subscribe 注册的函数队列，数组。每次执行mutation时候都会执行这个队列里面的函数,在mutation函数执行之后。      

+ _actionSubscribers
store.subscribeAction 注册函数存放队列，数组。默认是action执行之前执行。
注册的函数可以值一个函数，也可以是一个对象，如果是函数fn会被处理成一个对象：{
  before:fn
},如果是一个对象，这个对象就是类似这种结构{
  before:bFn, //action函数执行之前
  after:aFn,  //action函数执行之后
  error:eFn   //action 执行出错时候执行 的函数
}。

+ _withCommit 函数
内部使用的，参是一个函数，主要是执行传入的函数，在执行前改变一下 this._committing 属性，执行完毕后，还原之前的 _committing状态。     

+  commit 函数
执行 ```commit``` 会根据传入的type从 ```_mutations```拿到 mutations数组函数，然后通过 _withCommit去执行mutations数组中的每一个函数，就真正的执行了我们写的 mutaion，执行完毕后，会执行 ``` this._subscribers ```数组中的函数，在执行mutations数组过程中 `_committing`状态一定会临时变成true，执行完成后会恢复成执行之前的状态。     

+ dispatch 函数
执行 ``` dispatch ``` 会根据传入的type从 ``` _actions ```中找到对应的actions数组函数，在执行actions数组之前会执行，``` this._actionSubscribers ```中有 ``` before ``` 以及before对应的函数bFn，接着执行  actions数组函数（如果是多个，则用Promise.all去执行的，一个是直接执行actions[0](payload),执行完毕后，actions执行的结果是`Promise对象`,没有错误会执行``` this._actionSubscribers ```中有 ``` after ```属性对应的after对应的函数aFn，如果执行actions过程中有错误，则会执行 ``` this._actionSubscribers ```中有 ``` error ```属性对应的error函数eFn。   


### 执行过程说明

1. `Vue.use(Vuex)`
执行这个时候，给所有的vue实例都混入了一个在 ` beforeCreate `生命周期中执行 的函数，每一个`vue实例`都可以通过 `$store`访问 `Vuex.Store`的实例。

2. `new Vuex.Store(options)`
执行这个时候,执行了`constructor`函数。
2.1 创建一些属性,值得含义在上文讲过
```
    this._committing = false;
    this._actions = Object.create(null);
    this._actionSubscribers = [];
    this._mutations = Object.create(null);
    this._wrappedGetters = Object.create(null);
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null);
    this._subscribers = [];
    this._watcherVM = new Vue();
    this._makeLocalGettersCache = Object.create(null); 
```
2.1.1 在执行`ModuleCollection`创建`_modules`可以参考上文提到的`Store类 的说明中的 _modules`，此时`_modules`的结果如下:
```
// 这里在 Store类 的说明中的 _modules 的说明中是相同的
_modules = {
 root:{
   runtime:false,
   state：{ rootStateA:'rootA'}, //
   _rawModule: options, //就是传入的options
   _children:{
     moduleA:{
       runtime:false,
       state:{a : 'aaa' },
       _rawModule: moduleA,
       _children: {}
     }
   },
 }
}

```
2.2 实现了`commit` 和 ` dispatch`两个重要的函数，同时绑定了上下文`this`

```
    //  dispatch
   this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }


  // commit
  this.commit = function boundCommit (type, payload, options) {
    return commit.call(store, type, payload, options)
  }

```

2.3 执行 installModule函数

执行`installModule(store,rootState,path,module,hot)` ,`installModule`函数有五个参数，按顺序分别为
store：store实例,
rootState：根state,
path：path模块名字的数组,
module: path对应的module模块
hot: 一个判断标记位，可不关注，为false和非根模块时候执行的一些东西   

`第一次`执行的时候传入的参数`installModule(store,this._modules.root.state, [],this._modules.root)`,最后一个`hot`参数不穿为false。

根据传入进来的path得到的模块名字是`namespace = "" `,以及判断出来是`根模块`; 

2.3.1 执行获取上下文函数 makeLocalContext(store,namespace),获取当前模块的`state`和`getters`的 `local对象`。
  `第一次`执行`makeLocalContext(sotre,'')`,根据`namespace == ''`为空判断出为没有namespace `const noNamespace = true`,创建local对象，对于根模块其实就是store对象的部分属性

 `
 {
   dispatch: store.dispatch,
   commit: store.commit,
   getters: store.getters,
   state: store.state // 通过get属性和getNestedState(store.state,[])方法得到。访问时候就会执行get方法。
 }
 
 `
2.3.2 注册 mutaions， _mutations对象的数据来源
给 `Store类 的说明 中 _mutations` 中注测带命名的包装mutaion的函数 wrappedMutationHandler 的数组。
把我们写的 rootMutationA函数封装了一层，在调用this.this.$store.commit('rootMutationA',payload),时候就会调用 wrappedMutationHandler(payload),同时会调用我们自己写的rootActionA函数,同时把当前模块的state作为第一个参数，payload作为第二个参数
 

这时候的 `module 是 this._modules.root`;`forEachMutation`方法可以在 `Module实例`中查看('src/module/module.js')

```
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key 
    // 此时的 namespace为"", key就是根模块中的 mutaions中命名函数，如 ”rootMutationA“，
    // 所以 namespacedType = "rootMutationA"
    // mutation 为 根模块中的 rootMutationA函数
    registerMutation(store, namespacedType, mutation, local)
  })
```
上述函数执行完成后 `Store类 的说明 中 _mutations`暂时就变成了如下：
```
  // local为  步骤 2.3.1中生成的local对象 
  _mutations['rootMutationA'] = [ 
    function wrappedMutationHandler(payload){
      rootMutationA.call(store,
        // 我们写的模板中第一个参数
        local.state,  
        // 我们写的模板中的第二个参数
        payload
      )
    }
  ]
```

2.3.3 注册 actions ，_actions的数据来源   
给 `Store类 的说明 中 _actions` 中注测带命名的包装action的函数 wrappedActionHandler 的数组。  
把我们写的 rootActionA函数封装了一层，在调用this.$store.dispatch('rootActionA',payload),时候就会调用 wrappedActionHandler(payload),同时会调用我们自己写的rootActionA函数
 
这时候的 `module 是 this._modules.root`;
```
  module.forEachAction((action, key) => {
    // root属性存在 执行的是不带命名空间的，我们自己定义 action如果带了root为真的属性，其实相当于直接注册key的ation，而不是子模块命名空间+key的action
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })
  
```
  
上述函数执行完成后 `Store类 的说明 中 _actions`暂时就变成了如下：


```
 // local为  步骤 2.3.1中生成的local对象
 // action 函数的执行结果是个 Promise对象

 _actions['rootActionA'] = [ 
    function wrappedActionHandler(payload){
      let res = rootActionA.call(store, 
        // 我们写的模板中第一个参数
        {
        dispatch: local.dispatch, 
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state
        }, 
        // 我们写的模板中的第二个参数
        payload
      );
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
    }
  ]
```

2.3.4  注册getters函数模板，_wrappedGetters 数据来源

给 `Store类 的说明 中 _wrappedGetters` 中注测带命名的包装getter的函数 wrappedGetter函数。  

把我们写的 rootGetterB 函数封装了一层，生成_wrappedGetters， 在调用执行后续的`resetStoreVM`函数,时候就会生成一个包装wrappedGetter的函数
`function wrappedGetterComputed（）{ wrappedGetter(store) } `传入根store对象,
`生成一个vue的computed：{rootGetterB: wrappedGetterComputed }`,利用vue的计算属性，来调用`wrappedGetterComputed`,同时调用了 `wrappedGetter` 以及我们自己写的`rootGetterB`函数，在这个函数里面已经包装好了参数`local.state, local.getters, store.state,store.getters`

这时候的 `module 是 this._modules.root`;

```
  module.forEachGetter((action, key) => {
    const namespacedType = namespace + key
    //namespacedType为 ""+'rootGetterB'
    // getter 为 根模块中getters的 rootGetterB 
    registerGetter(store, namespacedType, getter, local)
  
  })
  
```


  
上述函数执行完成后 `Store类 的说明 中 _wrappedGetters`暂时就变成了如
下：

```

 // local为  步骤 2.3.1中生成的local对象
_wrappedGetters={
  rootGetterB: wrappedGetter(store){ //store是在调用 resetStoreVM 传入的
     return rawGetter(
      local.state, 
      local.getters, 
      store.state,
      store.getters
  }
}

```


















