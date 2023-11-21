import { PerceptiveUtils, cModuleName, Translate } from "./utils/PerceptiveUtils.js";
import { PerceptiveFlags } from "./helpers/PerceptiveFlags.js";
import {vDCVisionFunctions, vTokenVisionFunctions, vTileVisionFunctions} from "./helpers/BasicPatches.js";
import { cDefaultChannel, VisionChannelsWindow, VisionChannelsUtils } from "./helpers/VisionChannelsHelper.js";
import { VisionUtils } from "./utils/VisionUtils.js";

var vLocalVisionData = {
	vReceiverChannels : []
}

class VisionChannelsManager {
	//DECLARATIONS
	static async updateVisionValues(pIgnoreNewlyVisibleTiles = false) {} //updates the local vision values based on controlled tokens
	
	static CheckTileVCs() {} //updates the VC based vision of all tiles on canvas
	
	//ons
	static async onTokenupdate(pToken, pchanges, pInfos, pUserID) {} //called when a token updates
	
	//IMPLEMENTATIONS
	static async updateVisionValues(pIgnoreNewlyVisibleTiles = false) {
		if (!game.user.isGM || game.settings.get(cModuleName, "SimulatePlayerVision")) {
			vLocalVisionData.vReceiverChannels = VisionChannelsUtils.ReducedReceiverVCs(canvas.tokens.controlled.map(vToken => vToken.document));		
		}
		else {
			vLocalVisionData.vReceiverChannels = [];
		}
		
		//SpottingManager.CheckTilesSpottingVisible(pIgnoreNewlyVisibleTiles);
		
		if (CONFIG.debug.perceptive.VCScript) {//DEBUG
			console.log("perceptive: New vision data:", vLocalVisionData);
		}
	}
	
	static CheckTileVCs() {
		let vTiles = canvas.tiles.placeables();
		
		let vEmitterVCs;
		
		let vChannel;
		
		for (let i = 0; i < vTiles.length; i++) {
			vEmitterVCs = PerceptiveFlags.getEmitters(vTiles[i].document);
			
			if (vEmitterVCs.length) {
				vChannel = VisionChannelsUtils.isVCvisible(PerceptiveFlags.getEmitters(vTiles[i].document), vLocalVisionData.vReceiverChannels, {SourcePoints : canvas.tokens.controlled.map(vToken => vToken.center),
																																				TargetPoint : vTiles[i].center,
																																				InVision : VisionUtils.simpletestVisibility(vTiles[i].center)});
																																		
				if (vChannel) {
					vTiles[i].visible = true;
					
					VisionChannelsUtils.ApplyGraphics(vTiles[i], vChannel);
				}
				else {
					if (vChannel == false) {
						vTiles[i].visible = false;
					}
				}
			}
		}
	}
	
	//ons
	static async onTokenupdate(pToken, pchanges, pInfos, pUserID) {
		
		if (pToken.isOwner && pToken.parent == canvas.scene) {
			VisionChannelsManager.updateVisionValues();
		}
	}
}

//Hooks
Hooks.once("ready", function() {
	if (!CONFIG.debug.hasOwnProperty(cModuleName)) {
		CONFIG.debug[cModuleName] = {};
	}
	
	CONFIG.debug.perceptive.VCScript = false;
	
	if (game.settings.get(cModuleName, "ActivateVCs")) {
		vDCVisionFunctions.push(function(pObject) {
			let vChannel = VisionChannelsUtils.isVCvisible(PerceptiveFlags.getEmitters(pObject.wall.document), vLocalVisionData.vReceiverChannels, {SourcePoints : canvas.tokens.controlled.map(vToken => vToken.center),
																																					TargetPoint : pObject.center,
																																					InVision : VisionUtils.simpletestVisibility(pObject.center)});
																																					
			if (vChannel) {
				VisionChannelsUtils.ApplyGraphics(pObject, vChannel);
			}
			
			return vChannel;
		});
		
		vTokenVisionFunctions.push(function(pObject) {
			let vChannel = VisionChannelsUtils.isVCvisible(PerceptiveFlags.getEmitters(pObject.document), vLocalVisionData.vReceiverChannels, 	{SourcePoints : canvas.tokens.controlled.map(vToken => vToken.center),
																																				TargetPoint : pObject.center,
																																				InVision : VisionUtils.simpletestVisibility(pObject.center)});
			
			if (vChannel) {
				VisionChannelsUtils.ApplyGraphics(pObject, vChannel);
			}
			
			return vChannel;
		});
	}
	
	Hooks.on("updateToken", (...args) => {VisionChannelsManager.onTokenupdate(...args)});
});