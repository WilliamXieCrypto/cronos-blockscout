import $ from 'jquery'
import _ from 'lodash'
import humps from 'humps'
import socket from '../socket'
import { connectElements } from '../lib/redux_helpers.js'
import { createAsyncLoadStore } from '../lib/async_listing_load'

export const initialState = {
  channelDisconnected: false
}

export const blockReducer = withMissingBlocks(baseReducer)

function baseReducer (state = initialState, action) {
  switch (action.type) {
    case 'ELEMENTS_LOAD': {
      return Object.assign({}, state, _.omit(action, 'type'))
    }
    case 'CHANNEL_DISCONNECTED': {
      return Object.assign({}, state, {
        channelDisconnected: true
      })
    }
    case 'RECEIVED_NEW_BLOCK': {
      if (state.channelDisconnected || state.beyondPageOne || state.blockType !== 'block') return state

      const blockNumber = getBlockNumber(action.msg.blockHtml)
      const minBlock = getBlockNumber(_.last(state.items))

      if (state.items.length && blockNumber < minBlock) return state

      return Object.assign({}, state, {
        items: [action.msg.blockHtml, ...state.items]
      })
    }
    default:
      return state
  }
}

const elements = {
  '[data-selector="channel-disconnected-message"]': {
    render ($el, state) {
      if (state.channelDisconnected) $el.show()
    }
  }
}

function getBlockNumber (blockHtml) {
  return $(blockHtml).data('blockNumber')
}

function withMissingBlocks (reducer) {
  return (...args) => {
    const result = reducer(...args)

    if (result.items.length < 2) return result

    const maxBlock = getBlockNumber(_.first(result.items))
    const minBlock = getBlockNumber(_.last(result.items))

    const blockNumbersToItems = result.items.reduce((acc, item) => {
      const blockNumber = getBlockNumber(item)
      acc[blockNumber] = acc[blockNumber] || item
      return acc
    }, {})

    return Object.assign({}, result, {
      items: _.rangeRight(minBlock, maxBlock + 1)
        .map((blockNumber) => blockNumbersToItems[blockNumber] || placeHolderBlock(blockNumber))
    })
  }
}

const $blockListPage = $('[data-page="block-list"]')
const $uncleListPage = $('[data-page="uncle-list"]')
const $reorgListPage = $('[data-page="reorg-list"]')
if ($blockListPage.length || $uncleListPage.length || $reorgListPage.length) {
  const blockType = $blockListPage.length ? 'block' : $uncleListPage.length ? 'uncle' : 'reorg'

  const store = createAsyncLoadStore(
    $blockListPage.length ? blockReducer : baseReducer,
    Object.assign({}, initialState, { blockType }),
    'dataset.blockNumber'
  )
  connectElements({ store, elements })

  const blocksChannel = socket.channel(`blocks:new_block`, {})
  blocksChannel.join()
  blocksChannel.onError(() => store.dispatch({
    type: 'CHANNEL_DISCONNECTED'
  }))
  blocksChannel.on('new_block', (msg) => store.dispatch({
    type: 'RECEIVED_NEW_BLOCK',
    msg: humps.camelizeKeys(msg)
  }))
}

export function placeHolderBlock (blockNumber) {
  return `
    <div class="my-3" style="height: 98px;" data-selector="place-holder" data-block-number="${blockNumber}">
      <div
        class="tile tile-type-block d-flex align-items-center fade-up"
        style="height: 98px;"
      >
        <span class="loading-spinner-small ml-1 mr-4">
          <span class="loading-spinner-block-1"></span>
          <span class="loading-spinner-block-2"></span>
        </span>
        <div>
          <div class="tile-title">${blockNumber}</div>
          <div>${window.localized['Block Processing']}</div>
        </div>
      </div>
    </div>
  `
}