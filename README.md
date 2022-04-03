# Vuex源码学习

### 入口文件 src/index.cjs.js

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

#### install 方法说明

+ Vue.use(Vuex)时候就会调用install，但是install是先执行，然后Vue实例是后执行，所以利用mixin混入生命周期来执行一些后续才执行的代码。   

+ install里面在Vue的v2版本使用的mixin混入，在beforeCreate这个生命周期中给每个Vue的实例挂载$store属性，所有每个实例都可以通过

+ options.store 是根实例才有的属性，非根实例，就需要用option.parent.$store 属性。刚好利用了beforeCreate的生命周期，父beforeCreate执行后，字beforeCreate执行，所以父亲肯定有$store属性，保证了顺序。




