/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 GeoMoose
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

/** Actions for map-sources
 *
 */

import { MAPSOURCE } from '../actionTypes'; 

import * as util from '../util';

/** Add a map-source using a MapSource
 *  object.
 */
export function add(mapSource) {
	return {
		type: MAPSOURCE.ADD,
		mapSource
	};
}

/** Add a layer to a mapsource.
 *
 */
export function addLayer(mapSourceName, layer) {
    return {
        type: MAPSOURCE.ADD_LAYER,
        mapSourceName,
        layer
    };
}

/** Convert all the <params> of a <map-source> into an object.
 *
 *  @param msXml The MapSource XML
 *
 *  @returns Object containing the params
 */
function parseParams(msXml) {
    var params_obj = {};
    for(let param of msXml.getElementsByTagName('param')) {
        params_obj[param.getAttribute('name')] = param.getAttribute('value');
    }
    return params_obj;
}



/** Convert a type='mapserver' layer into type='wms'
 *  style layer for internal storage.
 *
 *  @param msXml The MapSource XML
 *  @param conf  Application configuration object.
 *
 * @returns Object defining the WMS service.
 */
function mapServerToWMS(msXml, conf) {
    let urls = util.getTagContents(msXml, 'url', true);
    let mapfile = util.getTagContents(msXml, 'file');

    // if the url is null then default to the
    //  mapserver url.
    if(urls.length == 0) { urls = [conf.mapserver_url]; }

    let map_source = {
        type: 'wms',
        serverType: 'mapserver',
        urls: urls,
        params: {
            'MAP' : conf.mapfile_root + mapfile
        }, 
    };

    return map_source;
}

var MS_Z_INDEX = 100000;

/** Add a map-source from XML
 *
 */
export function addFromXml(xml, config) {
    // initialize the map source object.
	let map_source = {
        name: xml.getAttribute('name'),
        urls: util.getTagContents(xml, 'url', true),
        type: xml.getAttribute('type'),
        label: xml.getAttribute('title'),
        zIndex: xml.getAttribute('z-index'),
        layers: [],
        params: {}
    }

    // handle setting up the zIndex
    if(map_source.zIndex) {
        map_source.zIndex = parseInt(map_source.zIndex);
    } else {
        map_source.zIndex = MS_Z_INDEX;
        MS_Z_INDEX--;
    }


    // allow server-type hinting for hidpi displays.
    let server_type = xml.getAttribute('server-type');
    if(server_type) {
        map_source.serverType = server_type;
    }

    // set of 'correction' functions for mapsources that
    //  are parsed/tweaked to help the configurator.
    if(map_source.type == 'mapserver') {
        Object.assign(map_source, mapServerToWMS(xml, config));
    }

    // mix in the params
    Object.assign(map_source.params, parseParams(xml));

    // add all of the layers.
    let map_layers = [];
    for(let layerXml of xml.getElementsByTagName('layer')) {
        let layer_title = layerXml.getAttribute('title');

        let layer = {
            name: layerXml.getAttribute('name'),
            on: util.parseBoolean(layerXml.getAttribute('status')),
            favorite: util.parseBoolean(layerXml.getAttribute('favorite')),
            label: layer_title ? layer_title : map_source.label,
            templates: {}
        };

        for(let template_xml of layerXml.getElementsByTagName('template')) {
            let template_name = template_xml.getAttribute('name');
            let template_contents = util.getXmlTextContents(template_xml);
            layer.templates[template_name] = template_contents;
        }

        map_layers.push(addLayer(map_source.name, layer));
    }

	return [add(map_source)].concat(map_layers);
}

/** Remove a map-source from the application.
 *
 *  @param path The 'path'/name of the map-source.
 *
 */
export function remove(path) {
	return {
		type: MAPSOURCE.REMOVE,
		path
	}
}

/** Get the map-source definition from a store
 *
 *  @param store
 *  @param mapSourceName
 *
 *  @return the map-source definition
 */
export function get(store, mapSourceName) {
    return store.getState().mapSources[mapSourceName];
}

/** Get a map-source layer based on a catalog layer object.
 *
 *  @param store The master store.
 *  @param layer An object with {mapSourceName, layerName}
 *
 * @returns The layer from the map-source in the store.
 */
export function getLayer(store, layer) {
    let map_source = get(store, layer.mapSourceName);
    for(let l of map_source.layers) {
        if(l.name == layer.layerName) { return l; }
    }
    if(layer.layerName == null) {
        return map_source;
    }
    console.error('Cannot find layer', layer.mapSourceName, layer.layerName);
    throw {message: "Cannot find layer", layer};
}

/** This query is common enough that it's been reduced to 
 *  a handy function.
 *
 */
export function getVisibility(store, layer) {
    // the === normalizes everything when values are undefined.
    return (getLayer(store, layer).on === true);
}

/** Check whether a map-source is 'active',
 *  'active' is defined as having any layers 
 *  with status='on' or being a vector type map-source
 *  with the status='on'.
 *
 *  @param mapSource MapSource object from the state.
 *
 * @returns Boolean, true when the mapsource is active.
 */
function isMapSourceActive(mapSource) {
    if(mapSource.layers) {
        for(let layer of mapSource.layers) {
            if(layer.on) {
                return true;
            }
        }
    } else {
        // TODO: handle layer-less map-sources
    }
    return false;
}

/** Get the list of all map-sources which have a 
 *  layer that is on.
 */
export function getActiveMapSources(store) {
    let map_sources = store.getState().mapSources;
    let active = [];
    for(let ms in map_sources) {
        if(isMapSourceActive(map_sources[ms])) {
            active.push(ms);
        }
    }
    return active;
}

export function getLayerFromPath(store, path) {
    let ms_name = util.getMapSourceName(path);
    let layer_name = util.getLayerName(path);

    return getLayer(store, {mapSourceName: ms_name, layerName: layer_name});
}

export function getVisibleLayers(store) {
    let map_sources = store.getState().mapSources;
    let active = [];
    for(let ms in map_sources) {
        if(isMapSourceActive(map_sources[ms])) {
            for(let layer of map_sources[ms].layers) {
                if(layer.on) {
                    active.push(ms+'/'+layer.name);
                }
            }
        }
    }
    return active;
}