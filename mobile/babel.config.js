module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            'react-native-reanimated/plugin', // ESTA LINHA É O QUE FALTA!
        ],
    };
};
